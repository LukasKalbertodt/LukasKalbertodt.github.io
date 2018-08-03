---
layout: post
title:  "Solving the Generalized Streaming Iterator Problem without GATs"
date:   2018-08-03
---

**G**eneric **A**ssociated **T**ypes (GATs for short) are a long awaited extension to Rust's type system. They offer a way to work with higher kinded types -- a necessity in a couple of situations. A common example is the *streaming iterator*: an iterator able to return items borrowing from `self` (the iterator itself). Unfortunately, [GATs haven't even landed in nightly yet](https://github.com/rust-lang/rust/issues/44265). So while are waiting, we can try tackling the streaming iterator problem without GATs. In this post we explore three possible workarounds for situations where an associated type depends on the lifetime of a `&self` receiver.

<div class="tldr" markdown="1">
# 🔑 Key takeaways
- The core problem: let the implementor decide whether or not a returned type borrows from `self`.
- There exist a few approaches that don't need GATs.
- Those workarounds can in fact be useful in a couple of situations.
- But they are still very limited and hacky 🠒 GATs are needed to solve this problem properly.
</div>


---

# Target audience and "how to read?"

This post is targeted at somewhat experienced Rust programmers. Familiarity with Rust and a rough understanding of "type-level things" (such as HKTs) is assumed.

As you might have noticed, **this is a fairly long post**. My hope is that this serves as an extensive reference for the topic of "GAT workarounds". I try to discuss every important detail and show several use cases. I expect most readers to skip large parts of this post.

If you don't have the time, reading [the summary at the very end](#summary) is the best idea. Additionally, each workaround has its own "rating" section that discusses the workaround's advantages and disadvantages. You can use this table of contents to jump around:

- [**The problem**](#the-problem) (quick recap of the problem we're trying to solve)
    - [A better `io::Lines`](#a-better-iolines)
    - [Another useful example: mutable windows of a slice](#another-useful-example-mutable-windows-of-a-slice)
    - [Not the solution we want: the crate `streaming-iterator`](#not-the-solution-we-want-the-crate-streaming-iterator)
    - [Similar problems](#similar-problems)
- [**Workaround A**: lifetime parameter in trait](#workaround-a-lifetime-parameter-in-trait)
    - [Disadvantages](#disadvantages)
    - [Rating](#rating)
- [**Workaround B**: HRTBs & the family trait pattern](#workaround-b-hrtbs--the-family-trait-pattern)
    - [Family traits](#family-traits)
    - [The workaround](#the-workaround)
    - [Disadvantages](#disadvantages-1)
    - [A slight variation](#a-slight-variation)
    - [Rating](#rating-1)
- [**Workaround C**: wrapper type](#workaround-c-wrapper-type)
    - [Limitations of our approach so far](#limitations-of-our-approach-so-far)
    - [The workaround](#the-workaround-1)
    - [Advantages](#advantages)
    - [Disadvantages](#disadvantages-2)
    - [Rating](#rating-2)
- [**Summary**](#summary)

<br />
<br />
<br />
<br />
<br />
<br />

---


# The problem

Let's quickly recap the problem we're trying to solve.

As a first example, let's take a look at [`io::Lines`](https://doc.rust-lang.org/stable/std/io/struct.Lines.html): an iterator that can iterate over lines of an [`io::BufRead`](https://doc.rust-lang.org/stable/std/io/trait.BufRead.html). That type is very useful, but it has a major disadvantage: it returns `io::Result<String>`. This means that a new `String` object is allocated for every line, making the iterator pretty slow. This is a common pitfall and source of confusion (for example, see [this question on StackOverflow](https://stackoverflow.com/q/45455275/2408867)).


## A better `io::Lines`

The better solution would be to manage a `String` buffer in the iterator and yielding `io::Result<&str>` as item. That way the allocated buffer is reused for all lines. So why doesn't `io::Lines` do that? Let's try it:

```rust
struct Lines<B: BufRead> {
    reader: B,
    buffer: String,
}

impl<B: BufRead> Iterator for Lines<B> {
    type Item = io::Result<&str>;
    fn next(&mut self) -> Option<Self::Item> { … }
}
```

Compiling this results in:

```
error[E0106]: missing lifetime specifier
   |
10 |     type Item = io::Result<&str>;
   |                            ^ expected lifetime parameter
```

We can't just omit lifetime parameters, except in functions where lifetime elision kicks in. What lifetime do we need to annotate here? The lifetime of `&self`, as the `&str` is borrowed from the `String` in `Lines`. **This is exactly how streaming iterators are defined: the returned item borrows from `self`**.

But annotating the lifetime of `self` is not possible!

```rust
impl<B: BufRead> Iterator for Lines<B> {
    type Item = io::Result<&'s str>;
    fn next<'s>(&'s mut self) -> Option<Self::Item> { … }
}
```

This results in `undeclared lifetime` as the lifetime `'s` is only visible in the scope of the function definition.

With GATs, we can easily solve this problem (if we were to redefine the `Iterator` trait!):

```rust
trait Iterator {
    type Item<'s>;
    fn next(&mut self) -> Option<Self::Item<'_>>;
}

impl<B: BufRead> Iterator for Lines<B> {
    type Item<'s> = io::Result<&'s str>;
    fn next(&mut self) -> Option<Self::Item<'_>> { … }
}
```


## Another useful example: mutable windows of a slice

In the case of `io::Lines` we want to return a reference to memory inside the iterator. But using the `self` lifetime can help in other situations as well, making it possible to safely express certain constructs. A good example is a `WindowsMut` iterator. Already today there exists [`slice::Windows`](https://doc.rust-lang.org/stable/std/slice/struct.Windows.html) which is an iterator yielding overlapping windows of a slice. For example, `[1, 2, 3, 4].windows(2)` would yield the elements `&[1, 2]`, `&[2, 3]` and `&[3, 4]`.

Sometimes it would be useful to have a `WindowsMut`, yielding mutable overlapping windows of a slice. But this, again, is not possible with the current iterator trait. The following simple example shows that we could easily break the world:

```rust
let mut slice = ['a', '💣', 'c'];
let mut it = slice.windows_mut(2);
let x = it.next().unwrap();
let y = it.next().unwrap();

// Oops, now we have two mutable references to the second
// element: `&mut x[1]` and `&mut y[0]`
```

The above example would not be rejected by the compiler because `x` is not borrowed from `it`, so `it` is not "locked" as mutably borrowed. Thus the compiler let's us happily call `next()` a second time. Fortunately, it's not possible to write such an `Iterator` implementation in safe Rust. Trying it always results in errors ([see on Playground](https://play.rust-lang.org/?gist=ea50e340ee159d722aadaa1ed9695921&version=stable&mode=debug&edition=2015)).

With GATs it would be possible to have `WindowsMut` as the compiler would understand that the item is borrowed from the iterator. As such, a second `next()` call wouldn't be allowed while an item still existed.

## Not the solution we want: the crate `streaming-iterator`

[The crate `streaming-iterator`](https://crates.io/crates/streaming-iterator) defines [this trait](https://docs.rs/streaming-iterator/0.1.4/streaming_iterator/trait.StreamingIterator.html):

```rust
pub trait StreamingIterator {
    type Item: ?Sized;
    fn advance(&mut self);
    fn get(&self) -> Option<&Self::Item>;   // <-- reference
}
```

This main point to notice is that `Self::Item` is always returned by reference and not by value. This is certainly useful in some situations, but now the trait doesn't allow returning items by value -- which is also a limitation. Thus this solution requires two traits to work in all situations.

That's not what we want. **In this post we are interested in solutions that only require one trait and where the impl can choose whether or not the `Item` borrows from `self`.** This will solve a range of other problems as well, instead of only the streaming iterator one.


## Similar problems

Another great example is a generic `Map` trait abstracting over types which are able to map an `Index` to an `Out`. This is fairly similar to [`ops::Index`](https://doc.rust-lang.org/stable/std/ops/trait.Index.html), but we want to allow returning `Out` by value! This is useful in a couple of ways, because it lifts the require&shy;ment that the `Out` value needs to be stored in `self`. For example, closures with the signature `Fn(Index) -> Out` could implement `Map` (but not `ops::Index`).

Just as `StreamingIterator`, it's currently impossible to define such a `Map` trait.

The `Map` example is actually what got me started to research this topic. I really need such a `Map` trait for a project of mine. I implemented all three of the workarounds in my code base and thus have a some experience from that -- which is a good addition to playing with minimal examples.



<br />
<br />
<br />
<br />
<br />
<br />


# Workaround A: lifetime parameter in trait

Our first idea is to put the lifetime parameter on the trait itself and using it in the `self` argument:

```rust
trait Iterator<'s> {
    type Item;
    fn next(&'s mut self) -> Option<Self::Item>;
}
```

This allows to use the lifetime parameter in the `Item` definition. But it also allows to ignore the lifetime parameter and have an `Item` that doesn't borrow from `self`:

```rust
impl<'s, B: BufRead> Iterator<'s> for Lines<B> {
    // Streaming iterator: we borrow from `self`
    type Item = io::Result<&'s str>;
    fn next(&'s mut self) -> Option<Self::Item> { … }
}

impl<'s> Iterator<'s> for Fibonacci {
    // "Normal" iterator: not borrowing from self
    type Item = u64;
    fn next(&'s mut self) -> Option<Self::Item> { … }
}
```

This is very promising! With the Fibonacci iterator, we can have multiple items at the same time, which is perfectly safe. On the other hand, we cannot have two items at the same time from the `Lines` iterator, which is also desired behavior (remember: there is only one string buffer, so we only store one line at a time).

```rust
let mut fib = Fibonacci::new();
let a = fib.next().unwrap();
let b = fib.next().unwrap(); // <-- works


let reader = io::Cursor::new(b"abc\ndef\nghi");
let mut lines = Lines::new(reader);
let line_1 = lines.next();
let line_2 = lines.next();  // <-- error: cannot borrow `lines` as mutable
                            //     more than once at a time
```

## Disadvantages

However, there are several problems with this workaround. First of all: the trait has a lifetime parameter. This means that a lifetime parameter is necessary every time the trait is used (as bound, for example) and thus *infects* other signatures. Let's try to write a function that counts the number of items in an iterator:

```rust
fn count<I>(mut iter: I) -> usize
where
    I: Iterator<'?>,  // <-- we need a lifetime
{ … }
```

There are multiple ways one could try to solve this:

- **`fn count<'s, I: Iterator<'s>>(mut iter: I)` (lifetime parameter in the function)**: this doesn't work. Generic parameters of the functions are chosen by the caller, not the callee. The problem is that we own the iterator (it lives in our stack frame) and thus we have to choose the lifetime. The caller couldn't possibly know the correct lifetime. And indeed, we get a compiler error.

  It's also important to note that this doesn't work because traits are invariant in respect to their parameters. So if we know that a type implements `Iterator<'x>`, we can't know whether or not the type also implements `Iterator<'y>` for any lifetime `'y != 'x` (even if `'y` outlives `'x` or the other way around).

- **`I: for<'s> Iterator<'s>` (HRTBs)**: with the higher ranked trait bounds syntax we say that `I` needs to implement `Iterator<'s>` for every possible lifetime. Now we can choose the fitting lifetime for our stack frame and call `next()`. Good!

  But we have a new problem: requiring the trait bound for all possible lifetimes is pretty restricting. What we actually would like to say is "for all lifetimes outlived by `I`, `I` has to implement `Iterator`" (but it's impossible to express this). The iterator `impl`s we have seen so far won't cause problems, but imagine how the `impl` for `WindowsMut` would look like:

  ```rust
  impl<'a, 's, T: 's> Iterator<'s> for WindowsMut<'a, T> {
      type Item = &'s mut [T];
      …
  }
  ```

  Here, the `T: 's` bound is required to be able to express the reference for `Item`. But this restricts the `impl`! This bound plus `for<'s> Iterator<'s>` is equivalent to `for<'s> T: 's` which is equivalent to `T: 'static`. The effect is that `count` only works with `WindowsMut` if `T` is `'static`. Needlessly restrictive!

- **`fn count<'s, I>(iter: &'s mut I)` (iterator by reference)**: this time we allow the caller the choose the lifetime by passing the iterator by reference. In theory, this is good: now the iterator doesn't live in our stackframe and the reference we get already has the correct lifetime for the `next()` call.

  And indeed, we can call `next()`. *Once*. Since the `next()` call requires a mutable `self`, calling it a second time results in a "cannot borrow `*iter` as mutable more than once at a time". I won't get into the details here, but this is simply how the borrow checker works. Usually the borrow checker will try to find the smallest possible lifetime for a call -- in order to "block" the reference for the smallest possible time/scope. But in this case, there is only one possible lifetime for the call: `'s`. Again: traits are invariant over their parameters, so the compiler doesn't have a choice.

  This is not a problem for methods with immutable receiver, so there are situations where this works (like the `Map` example). However, this is only possible if you are able to take the object by reference. Sometimes that's not possible!

Furthermore, adding bounds for the associated type (`Item`) is not fun. Take a look at this:

```rust
where
    I: for<'s> Iterator<'s>,
    I::Item: Clone, // <-- error: cannot extract an associated type from a
                    //     higher-ranked trait bound in this context
```

Instead you have to write:

```rust
where
    I: for<'s> Iterator<'s>,
    for<'s> <I as Iterator<'s>>::Item: Clone,
```

Uhg!

<small markdown="1">(This isn't that big of a problem with [RFC 2289](https://github.com/rust-lang/rfcs/pull/2289), but that's also not yet implemented...)</small>

## Rating

You can get fairly far with this workaround, but there are a ton of annoyances and eventually you'll hit a real limitation you cannot work around. Having a lifetime parameter in the trait is also semantically wrong and pollutes signatures everywhere.

I worked with this approach for a few weeks in my codebase and nearly lost my mind. Frequent, super strange lifetime errors are not fun...

You can play with this workaround in [this playground](https://play.rust-lang.org/?gist=b366685a47e465b1baa4d25df9c0dadd&version=stable&mode=debug&edition=2015).

<br />
<br />
<br />
<br />
<br />
<br />
<br />

# Workaround B: HRTBs & the family trait pattern

In the last section, we already saw HRTBs (**h**igher **r**anked **t**rait **b**ounds) which allow us to express trait bounds that are generic over lifetimes. As it already carries "higher ranked" in its name, it's not surprising that this feature allows us to get one step closer to HKTs in today's Rust.

But to use this power, we need something else: the family trait pattern.


## Family traits

Nicholas Matsakis introduced that pattern in [one of his blog posts about GATs](http://smallcultfollowing.com/babysteps/blog/2016/11/03/associated-type-constructors-part-2-family-traits/#introducing-type-families) (formerly known as ATC, associated type constructors). He used that pattern to show that GATs are more powerful than one would initially assume. But as it turns out, we can use the same idea without GATs.

Said pattern is made of two parts:

- **Family types**: to the type system, these are normal types. But semantically, they *represent* type constructors (generic types without their generic parameters applied). For example, a type `VecFamily` could *represent* the type constructor `Vec`.
<div style="height: 10px"></div>
- **Family trait**: a trait that abstracts over some family types.

The trick is how to actually use the type constructor that is being represented. For that we use associated types and treat the family type as a function from types/lifetimes to type. Traits with associated types allow us to model type level functions. (*Side note*: this can be used to do arbitrary computations at compile time, see [`typenum`](https://crates.io/crates/typenum) for example.)

The associated type is the output of our type level function. The only question is how to pass the input parameters to the "function". One possibility are GATs:

```rust
trait CollectionFamily {
    type Collection<T>;
}

enum VecFamily {}
impl CollectionFamily for VecFamily {
    type Collection<T> = Vec<T>;
}

fn generic_over_collection<C: CollectionFamily>() {
    // Here, we can basically treat `C` as a type constructor or
    // type level function: we choose different `T`s and get a new
    // type for each.
    let _: C::Collection<u32> = unimplemented!();
    let _: C::Collection<bool> = unimplemented!();
}

// Call it:
generic_over_collection::<VecFamily>();
```

Similarly, one could create other families (e.g. `LinkedListFamily`) that would represent other collection types. The important point to understand here:

**The family trait pattern works by "delaying" the application of generic parameters. For each type constructor of interest, a family type is created that *represents* that type constructor. Through a trait, that family type can be used to construct types.**

While GATs make this pattern easier and more powerful to use, it still works without. The other way to pass the input parameter is via the trait:

```rust
trait CollectionFamily<T> {
    type Collection;
}

enum VecFamily {}
impl<T> CollectionFamily<T> for VecFamily {
    type Collection = Vec<T>;
}
```

However, we notice a problem when we try to use it as above:

```rust
//                            vvvvvv
fn generic_over_collection<C: for<T> CollectionFamily<T>>() {
    // Slightly more verbose to use the type constructor
    let _: <C as CollectionFamily<u32>>::Collection = unimplemented!();
    let _: <C as CollectionFamily<bool>>::Collection = unimplemented!();
}
```

Since the parameter is in the trait now, we need to use HRTBs instead of simple trait bounds. And HRTBs only work for lifetime parameters at the moment. So this workaround -- as the others -- only works for lifetime parameters.

<small markdown="1">*Note*: we can't write `<T, C: CollectionFamily<T>` because then the caller (not the callee) chooses `T`. We had a similar situation above.</small>


## The workaround

Putting everything together, we get this solution:

```rust
// The family trait for type constructors that have one
// input lifetime.
trait FamilyLt<'a> {
    type Out;
}

// A family which represents a type constructor that always
// returns `T` (thus "id").
struct IdFamily<T: ?Sized>(PhantomData<T>, !);
impl<'a, T: ?Sized> FamilyLt<'a> for IdFamily<T> {
    type Out = T;
}

// Represents references to `T`.
struct RefFamily<T: ?Sized>(PhantomData<T>, !);
impl<'a, T: 'a + ?Sized> FamilyLt<'a> for RefFamily<T> {
    type Out = &'a T;
}
```

Several things to note here:

- We defined two families already: one for references to `T` and one for `T` by value.
- The type `T` of the families is generic, but that parameter is not the one we want to delay applying. So it's fine.
- The `!` is the never type which makes sure that the family types are never instantiated. This is not strictly necessary for this workaround, but nothing says "this is not useful at runtime" quite like `PhantomData` combined with `!`.

Let's finally define our `Iterator` trait with it:

```rust
trait Iterator {
    // This basically reads: "`Item` is a function from any
    // lifetime to a type".
    type Item: for<'a> FamilyLt<'a>;

    // "Use" the function here to get the constructed type.
    fn next<'s>(&'s mut self)
        -> Option<<Self::Item as FamilyLt<'s>>::Out>;
}
```

A bit verbose, but it works. Now we can implement `Lines` like this:

```rust
impl<B: BufRead> Iterator for Lines<B> {
    // We simplify things a bit here: instead of `io::Result<&str>`
    // (as above), we simply return `&str`. See the playground link
    // below for the full version.
    type Item = RefFamily<str>;

    fn next<'s>(&'s mut self)
        -> Option<<Self::Item as FamilyLt<'s>>::Out>
    { … }
}
```

It works! For the Fibonacci iterator we would set `Item` to `IdFamily<u64>` which also works as expected.

This workaround has a major advantage over the workaround A: the lifetime parameter is not in the trait anymore! This means that certain things are easier to express and won't cause problems anymore. Look how simple the `count` example from above has become with this solution:

```rust
fn count<I: Iterator>(mut iter: I) -> usize { … }
```

Also nice: we can have multiple items from the Fibonacci iterator in scope at the same time, while the compiler won't let us have multiple items of the `Lines` iterator. Perfect!


## Disadvantages

Unfortunately, this approach suffers from some of the same limitations as workaround A. In particular, our usage of HRTBs leads to some unnecessarily strict requirements. Let's take a look at how we would implement `Iterator` for `WindowsMut`:

```rust
// A new family for mutable references
struct MutRefFamily<T: ?Sized>(PhantomData<T>, !);
impl<'a, T: 'a + ?Sized> FamilyLt<'a> for MutRefFamily<T> {
    type Out = &'a mut T;
}

//          vvvvvvv
impl<'a, T: 'static> Iterator for WindowsMut<'a, T> {
    type Item = MutRefFamily<[T]>;
    …
}
```

Without the `'static` bound of `T`, the compiler refuses to compile this. Why? Remember how `Item` was defined in the trait: `type Item: for<'a> FamilyLt<'a>`. But the impl for `MutRefFamily` bounds `T` with `'a`. With the same logic we already applied above, this means that `T` needs to be `'static`.

Additionally, due to the use of HRTBs, specifying trait bounds for the real `Item` type is still ugly:

```rust
where
    I: Iterator,
    for<'a> <I::Item as FamilyLt<'a>>::Out: Display,
```

## A slight variation

One idea to get rid of HRTBs is to move the `FamilyLt` bound to the method:

```rust
trait Iterator {
    type Item;  // <-- no bound

    fn next<'s>(&'s mut self)
        -> Option<<Self::Item as FamilyLt<'s>>::Out>
    where
        Self::Item: FamilyLt<'s>;  // <-- bound, but not HRTB
}
```

While this requires [a little workaround of its own](https://stackoverflow.com/q/51638863/2408867), this actually looks very promising at first. We can successfully compile most of what we want. But once we want to use `Iterator` as a trait bound, we are in trouble again:

```rust
fn count<I: Iterator>(mut iter: I) -> usize {
    iter.next();
    //   ^^^^ the trait `FamilyLt<'_>` is not implemented
    //        for `<I as Iterator>::Item`
    …
}
```

Right... with only `Iterator` as bound, we cannot assume that `FamilyLt` is implemented for `Item`, so we cannot call `next()`. The only solution to solve it in this case is to -- you guessed it -- add a HRTB to the signature of `count`. *Sigh*.

You can find the full code of this variation [here](https://play.rust-lang.org/?gist=9bea8ed57d6641c12199b61ea4b2787f&version=nightly&mode=debug&edition=2015).


## Rating

In this section we saw that we can use the family trait pattern even without GATs to get some way to represent HKTs. That way we successfully removed the lifetime parameter from the `Iterator` trait, but now we have a lifetime parameter in another trait. This change helps in a few situations, but some of the core issues remain:

- Needlessly strict lifetime requirements on some type parameters emerge.
- Bounding the item type is super verbose (so it still pollutes most signatures it appears in).

This approach certainly works in a couple of situations and while it requires a bit more boilerplate code, it has a few advantages over workaround A. But you should certainly be aware of the limitations.

All code I've shown above (and more) can be found [in this Playground](https://play.rust-lang.org/?gist=2d0f87f3f7a60a70b14a871760f4b91e&version=nightly&mode=debug&edition=2015). There you can play around with this workaround for yourself.

<small markdown="1">(Something very similar to this approach [has been suggested in the RFC thread about GATs](https://github.com/rust-lang/rfcs/pull/1598#issuecomment-215984749))

<br />
<br />
<br />
<br />
<br />
<br />
<br />


# Workaround C: wrapper type

The two workarounds we saw so far were "open solutions" in that implementors were not restricted in the type they return from `next()`. This works by letting every `impl` block define a type level function that maps a lifetime to a type: we provide the lifetime of `self` and every `impl` block has to pass us a type in return.

## Limitations of our approach so far

To define a type level function in Rust, we need associated types: they are the output of that function. As we've seen above, we also need a way to pass input parameter (in our case: one lifetime). Let's take a look at the explicit, global path of the type returned by `next()` in both previous workarounds:

- (A) `<Self as Iterator<'a>>::Item`
- (B) `<<Self as Iterator>::Item as FamilyLt<'a>>::Out`

These are the "function calls" for the type level function. Paths to associated types always look like `<QSelf as Trait<...>>::Assoc`, where `QSelf` could be another associated type. Somewhere in that path we have to specify the input lifetime as parameter. **The only way to pass lifetimes is via `Trait<...>`**. We cannot pass parameters to `Assoc` (because, well, if we could, I wouldn't be writing this article). And we cannot pass parameters to `QSelf`, because from the inside of the trait that's either `Self` (which we cannot pass parameters to) or another associated type.

And this is actually what we did so far: pass the input lifetime via trait parameter. We could make it even more nested than workaround B by introducing a third trait, but that doesn't change the fundamental problem about this approach: at some point we have to make sure that the trait with the lifetime parameter is implemented. Thus we have to add a bound for it. It seems to be impossible to avoid HRTBs for this, since we don't always have a specific lifetime in scope. And well, HRTBs lead to `'static` bounds -- our main problem.

With that, I declare this idea-space as exhausted. I'm pretty sure the solutions so far are pretty much the best we can get if we want to give the implementor complete freedom in choosing the `Item` type.

So **for this last workaround, we will instead use a completely different approach**. That will introduce a bunch of new limitations and problems, but might solve some things we weren't able to solve before.


## The workaround

Let's start with something fairly similar to [`Cow`](https://doc.rust-lang.org/stable/std/borrow/enum.Cow.html): an enum with three variants, one for each of `T`, `&T` and `&mut T`.

```rust
enum Wrap<'a, T: 'a> {
    Ref(&'a T),
    RefMut(&'a mut T),
    Owned(T),
}

// This is the main way to access the data
impl<'a, T: 'a> Deref for Wrap<'a, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // In case you're wondering why this works without `&`
        // and `ref`: default binding mode, RFC 2005
        match self {
            Wrap::Ref(v) => v,
            Wrap::RefMut(v) => v,
            Wrap::Owned(v) => v,
        }
    }
}

trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Wrap<'_, Self::Item>>;
}
```

You might already notice multiple limitations of that solution, but let's keep going and try to improve this approach before evaluating it.

One of the most notable disadvantages is the introduction of runtime overhead: the returned type is larger and we need branches when inspecting the type to check which variant is currently stored in the enum. This is not needed: we know that a specific iterator will *always* return the same enum variant (e.g. `Owned`). Can we somehow encode this information in the type system and possibly make working with `Wrap` a bit easier?

Yes, by introducing marker types.

```rust
trait Marker {
    type Ref;
    type RefMut;
    type Owned;
}

enum RefMarker {}
impl Marker for RefMarker {
    type Ref = ();
    type RefMut = !;
    type Owned = !;
}
```

Similarly, we have `RefMutMarker` (`!, (), !`) and `OwnedMarker` (`!, !, ()`). What is this good for? Let's modify `Wrap`:

```rust
enum Wrap<'a, T: 'a, M: Marker> {
    Ref(&'a T, M::Ref),
    RefMut(&'a mut T, M::RefMut),
    Owned(T, M::Owned),
}
```

Each variant stores an extra field which is determined by the marker type. Again, `!` is the *never type* which has many interesting properties. There can never be an instance of `!` (unless you are really naughty), which means that all code paths that contain a value of type `!` are unreachable.

This instructs the compiler to remove the `match` branch, because only one of those variants doesn't hold a `!` value. [Even on `opt-level=1`, the branch in `deref()` is already removed](https://godbolt.org/g/8QZ9XJ). Unfortunately, the size of `Wrap` is still like before. But since `Wrap` is usually only a temporary value, it is to be expected that a good optimizer removes `Wrap` completely ([which is exactly what happens in the above example for `opt-level=2`](https://godbolt.org/g/zPZrTv)).

With these marker types, we can add a couple of useful `From` impls:

```rust
impl<'a, T> From<T> for Wrap<'a, T, OwnedMarker> {
    fn from(src: T) -> Self {
        Wrap::Owned(src, ())
    }
}

// The same for `Ref` and `RefMut`
impl<'a, T> From<&'a     T> for Wrap<'a, T, RefMarker>    { … }
impl<'a, T> From<&'a mut T> for Wrap<'a, T, RefMutMarker> { … }
```

Additionally, we can offer a more powerful way to extract the value:

```rust
impl<'a, T> Wrap<'a, T, OwnedMarker> {
    fn into_inner(self) -> T {
        match self {
            Wrap::Owned(v, ()) => v,
            Wrap::Ref(_, n) => n,
            Wrap::RefMut(_, n) => n,
        }
    }
}

// Plus the corresponding impls for `Ref` and `RefMut`
```

With that, we can completely hide the implementation detail of `Wrap`. Users only need to know about the three marker types and the tiny API to get values in and out.

Here is the implementation of `Iterator` for `Fibonacci`:

```rust
impl Iterator for Fibonacci {
    type Item = u64;
    type Marker = OwnedMarker;

    fn next(&mut self) -> Option<Wrap<'_, Self::Item, Self::Marker>> {
        let out = self.curr;
        self.curr = self.next;
        self.next += out;

        Some(out.into())
    }
}
```


## Advantages

Let's first talk a bit about what we have gained by this approach.

First: no HRTBs! This means that we won't encounter emerging `'static` bounds anymore and are less restricted in that sense. Furthermore, using `Iterator` as bound and bounding the `Item` type is super easy (just like with the standard `Iterator` trait):

```rust
fn print_all<I>(mut iter: I)
where
    I: Iterator,
    I::Item: std::fmt::Display,
{ … }
```

Note that this only makes sense for traits that can be used via immutable reference (like `Display`), because we can't be sure to get more than that from the iterator. If you need to make sure that you get the `Item` by value, you can do that too:

```rust
    I: Iterator<Marker = OwnedMarker>,
```


This means we solved the two main problems of the previous workaround!


## Disadvantages

Of course, this solution is also *far* from perfect. Let's list the main disadvantages and limitations:

- You can't return references to unsized types. The parameter `T` of `Wrap` needs to keep the `Sized` bound -- otherwise the `Owned(T)` variant wouldn't be legal. This has the consequence that we can't implement `WindowsMut` as we need to return `&mut [T]`. It might or might not be possible to somehow work around this limitation with `unsafe` code -- I haven't tried.

- The type returned by `next()` is limited. For example, in `Lines`, we would like to return `io::Result<&str>`. But in that type, the lifetime parameter isn't on the outside, so we can't represent it with `Wrap` as shown above. Of course, we could add another variant for this case, but adding new variants results in quadratic code explosion. We need one marker trait for each variant which in turn needs to define an associated type for each variant. Extending `Wrap` thus gets unfeasible quickly. (Macros might help, but still ...)

- The compiler now assumes that all values returned by `next()` borrow from `self`. This means that we can't have multiple items at the same time, even if those items are actually not borrowed:

  ```rust
  let mut fib = Fibonacci::new();
  let a = fib.next();
  let b = fib.next(); // <-- cannot borrow `fib` as mutable more
                      //     than once at a time
  ```

  This is usually not a big problem, but it's still unfortunate.


## Rating

This workaround is very different from the first two. It solves the problems associated with (A) and (B), but has a lot of own limitations.

Interestingly, this workaround worked best for me. In my codebase, those involuntary `'static` bounds were not acceptable, so I didn't really have a choice. But additionally, the limitations of this workaround aren't that problematic for the `Map` trait example mentioned in the beginning:

- The receiver is `&self`, so we can't return mutable references anyway. That reduces the code required to define `Wrap` and the marker types.

- Also thanks to the `&self` receiver, we can have multiple values from the same map at the same time (it's only immutably borrowed).

- Types implementing `Map` (almost always) fall into one of two categories: those storing the values inside of them (like `HashMap`) and those generating the values (like closures). This fits nicely to what `Wrap` offers. There is no real need to return something like `Result<&T>`.

So the usefulness of this workaround depends a lot on your use case. The full code for this workaround can be found [on this Playground](https://play.rust-lang.org/?gist=15eb188d85f725feaf285c4eb87e3bc4&version=nightly&mode=debug&edition=2015).


<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />

---

<br />

# Summary

In this post we tried to create a trait for streaming iterators in today's Rust (i.e. without GATs). That trait is supposed to be general enough to allow both, owned items and items borrowed from `self`. We discussed three possible "solutions":

- [**(A) lifetime parameter in trait**](#workaround-a-lifetime-parameter-in-trait): a lifetime parameter is added to the trait itself (`trait Iterator<'s>`) and used in the `self` argument (`fn next(&'s mut self)`). This makes it possible for impl blocks to use that lifetime in the associated `Item` type.

- [**(B) family types**](#workaround-b-hrtbs--the-family-trait-pattern): a modified version of the "family trait pattern" is used here. The `Item` type of `Iterator` is now a family type which serves as a type level function that maps a lifetime to a type (e.g. `'a` is mapped to `Option<&'a u32>`). We can use that family type in the signature of `next` to construct a type from the lifetime of `self`.

- [**(C) wrapper type**](#workaround-c-wrapper-type): an enum similar to `Cow` is created. It can differentiate between owned and borrowed at runtime. That wrapper type is returned by `next`, linking the `self` lifetime and the lifetime parameter of that wrapper. With the use of marker types, we can remove most runtime overhead and improve the API.

All three workarounds have several limitations.

(A) and (B) mainly suffer from the problem that HRTBs have to be used at some point. This becomes a problem when paired with the fact that the bound `T: 'a` is necessary to use the reference type `&'a T`. That's because `for<'a> T: 'a` is equivalent to `T: 'static` which is a strict and in our case unnecessary requirement. (Interestingly, even with GATs, this is not trivial to solve.) Additionally, adding trait bounds to the `Item` type of the iterator is very verbose.

Workaround (C) doesn't have those problems, but is limited in several other ways: it only allows for a fixed number of different "type forms" (like `T`, `&'a T` and `Option<&'a T>`) and doesn't allows references to unsized types at all. Additionally, with this approach, the compiler can't tell if the returned item is actually borrowed from `self`. This leads to receiver objects being "locked as borrowed" for longer than necessary.

Whether or not a workaround works for you -- and if yes, which works best -- depends a lot on your situation. And if you are not in a hurry, you could probably also just wait for GATs (assuming this won't be another case like specialization 🦀).

<br />

**Conclusion**: there exist a few workarounds for the lack of GATs. They work in several situations and might in fact be useful (especially for those of us who need GATS now), but they are overall very limited and have a couple of disadvantages. Many problems are not properly solvable in today's Rust.

**<center>We really need GATs.</center>**
