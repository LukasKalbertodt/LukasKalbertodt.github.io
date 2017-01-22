---
layout: post
title:  "Abusing the Borrow Checker to make Tic-Tac-Toe safer"
date:   2017-01-20
---

This week's task of [the lecture "Programmieren in Rust" (German)][pir-gh] is to build a tic-tac-toe game. After implementing the required features, I tried to use the *borrow checker* and strong typing to avoid some bugs at compile time -- with partial success.

<div class="tldr" markdown="1">
# Key takeaways
- strong typing avoids runtime bugs
- with Rust's linear type system ("move semantics"), we can build types with the semantics of a key that can be used only once
- using the borrow checker, we can ensure that some properties of a variable remain valid
</div>

---

In tic-tac-toe ("TTT" from now on) you have a simple 3x3 grid where each cell can be empty or contain either a cross or a circle. To denote a cell, I'll be using the same notation used to denote a square on a chessboard, e.g. `[a3]`.

<center>
    <img src="/img/tictactoe.svg" style="width:50%;max-width:250px;border:none;margin:10px;"/><br />
    <i>Standard TTT board with row and column labels</i>
</center>


# Basic Program Structure

Before we get to the juicy parts, I have to show you the base structure of the program (if you're feeling adventurous, you can [skip ahead](#using-the-borrow-checker-to-keep-our-move-valid)). To describe a TTT-board, we will create custom types that perfectly meet our requirements, instead of using already existing types which can take on nonsensical values in our context. We want to make good use of Rust's strong type system!

<div markdown="1" style="float:left; width:49%;">
```rust
#[derive(Clone, Copy)]
enum Cell {
    Empty,
    Circle,
    Cross,
}
```
</div>

<div markdown="1" style="float:right; width:49%;">
```rust
#[derive(Clone, Copy)]
struct CellId {
    /// This row-major index will always
    /// be between 0 and 8 (inclusive).
    index: u8,
}
```
</div>
<br style="clear:both;"/>

Our board will be stored as `[Cell; 9]` in the type `GameState`. To index the board and get the value of a cell, we use `CellId` (see above). This means f indexing will never fail, because `CellId` *always* represents a valid cell on the board.

The task requires multiple different player types, including a *human player* (reading input from the terminal) and a *random player* (choosing a valid move at random). To abstract over different players, we will use a trait `Player`. Right now, we are only interested in this part:

```rust
trait Player {
    /// Given the current state of the game, return the ID of
    /// the cell in which the next marker should be set.
    fn next_move(&mut self, state: &GameState) -> CellId;
}
```

This is a pretty straightforward solution: it works fine and is pretty type safe, too.

But I was not quite satisfied with this solution and had been looking for an excuse to play with the borrow checker for some time already. I also recently found [this repository][sound-index] which implements "sound unchecked indexing" in Rust; the borrow checker is abused to assure that an array index is valid at the point of indexing. I only skimmed over the implementation without gaining a deeper understanding, so now I wanted to try something similar for my TTT implementation!

# A type representing a valid move

In short, I want `next_move()` to return a `ValidMove` instead of a `CellId`. The latter could reference a cell that is already filled: this would be an illegal move. In the solution so far, the code calling `next_move()` has to check whether or not the `CellId` is a valid move and exit the game in case it's not.

So how can we achieve this? First, we create a new type `ValidMove` which holds a `CellId`. The first good idea is to make it **impossible for outsiders to create an instance of `ValidMove`**. Instead, the only way to obtain a `ValidMove` is through a `GameState` which can verify the move before declaring it as valid. Let's try it:

```rust
// The field is private: no one outside of this module can
// create a `ValidMove` instance.
struct ValidMove(CellId);

impl ValidMove {
    pub fn id(&self) -> CellId { self.0 }
}

impl GameState {
    // Public method: this is the only way to obtain a
    // `ValidMove` from the outside.
    pub fn verify_move(&self, id: CellId) -> Option<ValidMove> {
        if /* is the cell at [id] empty? */ {
            Some(ValidMove { id: id })
        } else {
            None
        }
    }

    pub fn set_cell(&mut self, m: ValidMove, value: Cell) {
        // We don't need to verify `m`. We know it's valid!
        …
    }
}
```

In the code calling `next_move()` we don't have to check the cell-id anymore, because we know it was verified before!

```rust
let valid_move = player.next_move();
game_state.set_cell(valid_move, Cell::Cross);
```

Nice! We can't even use a `ValidMove` twice, because it doesn't implement `Clone` and `set_cell()` takes it by value (moving it into the function). It makes sense to define `ValidMove` as a "*use only once*"-type, because after using it it's definitely not a valid move anymore!

But wait... what if the board is modified after the `ValidMove` was verified and created? At this point, we can still break the code. We could call `next_move()` twice, which would give us two `ValidMove` objects, which could possibly reference the same cell. And only then (after obtaining two objects), we could use one object to modify the game state. This would possibly invalidate the second move! Darn!

# Using the borrow checker to keep our move valid

Luckily, we can now use the full power of the borrow checker. We want to disallow modifications to the game state while a `ValidMove` exists, because every modification could invalidate the move. Our second good idea is: **what if `ValidMove` held an immutable reference to the game state**?

Great idea! The borrow checker would know that the game state is borrowed and would disallow modifications to it. And the best thing: we don't even have to use a real reference -- we can fake it. Let's see how:

```rust
struct ValidMove<'gs> {
    id: CellId,
    _phantom: PhantomData<&'gs ()>,
}
```

Woah, not so fast! What is going on here?

- We declare a lifetime `'gs` on the type which tells the compiler: this type is borrowing *something*.
- We introduce a new field of type `PhantomData`. Now what is that good for? Well... just try to compile without it: the compiler will print an error saying that the lifetime `'gs` is declared but not used. To trick the compiler, we are using [`PhantomData`][phantom], a sink for all of our unused type parameters.
- *Wait*! "type parameters"? Yes, unfortunately `PhantomData` only accepts a type parameter and not a lifetime parameter. Fortunately, we can simply integrate our lifetime parameter into a type (`&'gs ()`) which we can then pass to `PhantomData`.

Next, we have to adjust some lifetime parameters on the methods using `ValidMove`.

```rust
impl GameState {
    fn verify_move<'a>(&'a self, id: CellId)
        -> ValidMove<'a>
    { … }
}
```

Here, we explicitly say that `ValidMove` borrows *from* `self`. That's an important little detail which is sometimes overlooked. Assigning the same lifetime parameter to one argument and the return type doesn't only mean that the return type may live as long as the argument, but that the return type borrows *from* the argument. This makes perfect sense, it's just not immediately clear at first glance!

In the case of `verify_move()` we can (and thus should) remove the explicit lifetime parameter, because our use case is covered by [the third lifetime elision rule][lifetime-elision]. However, in the case of `next_move()` we can't avoid manual lifetime parameters:

```rust
trait Player {
    fn next_move<'a>(&mut self, state: &'a GameState)
        -> ValidMove<'a>;
}
```

With that done, we finally did it! Now the borrow checker will make sure that our game state is not modified while there is still a `ValidMove` referencing it.

There is only one problem: we can't use the `set_cell()` method anymore:

```rust
game_state.set_cell(valid_move, Cell::Cross);
```

Here, we will *first* attempt to borrow `game_state` mutably before doing anything else (in particular, before dropping the valid move). This is the very thing we wanted to prevent. And indeed, the Rust compiler refuses to compile. The only way to make it work is to extract the `CellId` from `ValidMove` and drop the `ValidMove` *before* attempting to borrow the game state mutably. By dropping the `ValidMove` the `GameState` is not in a borrowed state anymore and the borrow checker allows modifications again. But now we have to be able to mutate the game state with a simple `CellId`: disappointing.

Having thought a bit about this problem, I'm fairly certain there isn't any nice way to make it work without making it possible for everyone to modify the game state with a `CellId` (which defeats the whole purpose of our adventure). The best I could come up with is using a macro to hide the gory details.

---

In summary, this little experiment sadly **doesn't have that much practical value** in my application. Using the borrow checker for stuff it wasn't exactly built to do is **a very fun exercise** though!






[pir-gh]: https://github.com/LukasKalbertodt/programmieren-in-rust
[sound-index]: https://github.com/bluss/indexing
[phantom]: https://doc.rust-lang.org/std/marker/struct.PhantomData.html
[lifetime-elision]: https://doc.rust-lang.org/beta/nomicon/lifetime-elision.html
