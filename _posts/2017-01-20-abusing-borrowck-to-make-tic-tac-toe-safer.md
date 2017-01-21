---
layout: post
title:  "Abusing the Borrow Checker to make Tic-Tac-Toe safer"
date:   2017-01-20
---

This week's task in [the lecture "Programmieren in Rust" (German)][pir-gh] is to build a tic-tac-toe game. After implementing the required features, I tried to use the *borrow checker* and strong typing to avoid some bugs at compile time -- with partial success.

<div class="tldr">
    <h1>Key takeaways</h1>
    <ul>
        <li>strong typing avoids runtime bugs</li>
        <li>Rust's linear type system can help in a few surprising cases</li>
        <li>using the borrow checker, we can encode semantic information in the type system</li>
    </ul>
</div>

---

In Tic-Tac-Toe ("TTT" from now on) you have a simple 3x3 grid where each cell can be empty or contain either a cross or a circle. To denote a cell, I'll be using the same notation used to denote one square on a chessboard, e.g. `[a3]`.

<center>
    <img src="/img/tictactoe.svg" style="width:30%;border:none;margin:10px;"/><br />
    <i>Standard TTT board with row and column labels</i>
</center>

Before we get to the juicy parts, I have to show you the base structure of the program. To describe a TTT-board, we build some custom types which fit our needs exactly, instead of using already existing types which can take on values that don't make sense in your context. If we have a strong type system, we want to make good use of it!

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

Our board will be stored as `[Cell; 9]` in the type `GameState`. To index the board and get the value of one cell, we use `CellId` (see above). This means that indexing will never fail, because `CellId` *always* represents a valid cell on the board.

The task requires multiple different player types, including a human player (reading input from the terminal) and a *random player* (choosing one valid move at random). To abstract over different players, we will use a trait `Player`. Right now, we are only interested in this part:

```rust
trait Player {
    /// Given the current state of the game, return the ID of the cell in which
    /// the next marker should be set.
    fn next_move(&mut self, state: &GameState) -> CellId;
}
```

Pretty straight-forward solution: it works fine and is pretty type-safe, too. But I was not quite satisfied and wanted to play with the borrow checker. I also recently found [this repository][sound-index], which implements "sound unchecked indexing" in Rust; the borrow checker is abused to assure that an array index is valid at the point of indexing. I only skimmed over the implementation without gaining a deeper understanding, so now I wanted to try something similar for my TTT implementation.

In short, I want `next_move()` to return a `ValidMove` instead of a `CellId`. The latter could reference a cell that is already filled: this would be an illegal move. In the solution so far, the code calling `next_move()` has to check whether or not the `CellId` is a valid move and exit the game in case it's not.

So how can we achieve this? First, we create a new type `ValidMove` which holds a `CellId`. The first good idea is to make it **impossible for outsiders to create an instance of `ValidMove`**. Instead, the only way to obtain a `ValidMove` is through a `GameState` which can verify the move. Let's try it:

```rust
struct ValidMove {
    // This is private: no one outside of this module can create
    // a `ValidMove` instance.
    id: CellId,
}

impl ValidMove {
    pub fn id(&self) -> CellId {
        self.id
    }
}

impl GameState {
    // Public method: this is the only way to obtain a `ValidMove` from the
    // outside.
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

Nice! We can't even use a `ValidMove` twice, because it doens't implement `Clone` and `set_cell()` takes it by value (moving it into the function).

But wait... what if the board was modified after the `ValidMove` was verified and created? At this point, we can still break the code. We could call `next_move()` twice, which would give us two `ValidMove` objects, which could possibly reference the same cell. And only then (after obtaining two objects), we could use one object to modify the game state. This would possibly invalidate the second move! Darn!

---

Luckily, we can now use the full power of the borrow checker. We want to disallow modifications to the game state while a `ValidMove` exists, because every modification could invalidate the move. Our second good idea is: **what if `ValidMove` would hold an immutable reference to the game state**?

Great idea! The borrow checker would know that the game state is borrowed and would disallow modifications to it. And the best thing: we don't even have to use a real reference, but we can fake it. Let's see how:

```rust
struct ValidMove<'gs> {
    id: CellId,
    _phantom: PhantomData<&'gs ()>,
}
```

Woah, not so fast! What is going on here?

- We declare a lifetime `'gs` on the type which tells the compiler: this type is borrowing something!
- We introduce a new field of type `PhantomData`. Now what is that good for? Well... just try to compile without it: the compiler will print an error saying that the lifetime `'gs` is declared but not used. To trick the compiler, we are using [`PhantomData`][phantom], a sink for all of our unused type parameters. *Wait*! "type parameters"? Yes, unfortunately `PhantomData` only accepts a type parameter and not a lifetime parameter. Fortunately, we can simply integrate our lifetime parameter into a type (`&'gs ()`), which we can then pass to the ghost type.

Next, we have to adjust some lifetime parameters on the methods using `ValidMove`.

```rust
impl GameState {
    fn verify_move<'a>(&'a self, id: CellId) -> ValidMove<'a> { … }
}
```

Here, we explicitly say, that `ValidMove` borrows *from* `self`. That's an important little detail which is overlooked by some. Assigning the same lifetime parameter to one argument and the return type doesn't only mean that the return type may live as long as the argument, but that the return type borrows *from* the argument. It makes perfect sense, but it's not clear at first glance!

But in the case of `verify_move()` we can (and thus should) remove the explicit lifetime parameter, because our use case is covered by [the third lifetime-elision rule][lifetime-elision]. However, in the case of `next_move()` we can't avoid manual lifetime parameters:

```rust
trait Player {
    fn next_move<'a>(&mut self, state: &'a GameState) -> ValidMove<'a>;
}
```

We finally did it! Now the borrow checker will make sure that our game state is not modified while there is still a `ValidMove` referencing it.

---

There is only one problem: we can't use the `set_cell()` method anymore:

```rust
game_state.set_cell(valid_move, Cell::Cross);
```

Here, we will *first* attempt to borrow `game_state` mutably before doing anything else. This is obviously the very thing we wanted to prohibit. And indeed the Rust compiler refuses to compile. The only way to make it work is to extract the `CellId` from `ValidMove` and drop the `ValidMove`. That way, the game state is not in a borrowed state anymore and we can mutate it. But now we can mutate the game state with a simple `CellId` again: disappointing.

After having thought a bit about this problem, I'm fairly certain there is no nice way to make it work, except for using macros. Using the borrow checker for stuff it wasn't build to do is a very fun excercise, though!






[pir-gh]: https://github.com/LukasKalbertodt/programmieren-in-rust
[sound-index]: https://github.com/bluss/indexing
[phantom]: https://doc.rust-lang.org/std/marker/struct.PhantomData.html
[lifetime-elision]: https://doc.rust-lang.org/beta/nomicon/lifetime-elision.html
