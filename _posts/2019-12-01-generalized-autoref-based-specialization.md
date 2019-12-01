---
layout: post
title:  "Generalized Autoref-Based Specialization"
date:   2019-12-01
---

A few weeks ago, dtolnay [introduced the idea of autoref-based specialization][original-description], which makes it possible to use specialization-like behavior on stable Rust.
While the approach has some fundamental limitations, some other limitations of this initial description of the technique *can* be overcome.
This post describes an adopted version of autoref-based specialization called auto*de*ref-based specialization, which, by introducing two key changes, is more general than the original one and can be used in additional situation.


[original-description]: https://github.com/dtolnay/case-studies/tree/master/autoref-specialization


<div class="tldr" markdown="1">
# 🔑 Key takeaways
- TODO
</div>

**Foreword**

One thing might be worth clarifying up front: the adopted version described here does not solve *the* main limitation of autoref-based specialization, namely specializing in a generic context.
For example, given `fn foo<T: Clone>()`, you cannot specialize for `T: Copy` in that function with autoref-based specialization.
For these kinds of [parametricity][parametricity]-destroying cases, "real" specialization is still required.
As such, the whole autoref-based specialization technique is still mainly relevant for usage with macros.


<small>
I'd like to thank dtolnay for coming up with and publicly describing this ingenious idea.
</small>

[parametricity]: https://en.wikipedia.org/wiki/Parametricity



# Quick Recap: Method Resolution

"Method resolution" is the process in which the compiler tries to figure out certain details about a method call expression `receiver.method(args)`.
This mainly includes two [interdependent](https://stackoverflow.com/q/58889717/2408867) pieces of information which are not specified explicitly by the programmer:

- **Which method to call?** (An inherent method of a type? A method of a trait in scope?)
- **How to coerce the receiver type to match the `self` type of the method?**

Rust actually allows quite some flexibility to make method calls more convenient to use.
Unfortunately, this rather complex method resolution sometimes results in [surprising behavior](https://dtolnay.github.io/rust-quiz/23) and [backwards-compatibility hazards](https://github.com/rust-lang/rust/pull/65819).
Autoref-based specialization works by (ab)using the fact that method resolution prefers resolving to methods which require fewer type coercion of the receiver over methods that require more coercions.
Specifically, the technique uses *autoref coercions*, hence the name.

One consequence worth emphasizing is that this way, we are not limited like the "classical" specialization where one impl has to be strictly "more specific" than the other.
As an example, an impl for `String` is strictly more specific than an impl for `T: Display`, whereas the two impls `T: Display` and `T: Debug` do not have this relationship in either direction (since neither is a super trait bound of the other).
With generalized autoref-based specialization, we can simply define an ordered list of impls and the first one that applies to the receiver type is used.
I will call one entry in this list a "specialization level".
Specialization levels do not have to have "strictly more specific" relationships at all!



# Using auto*de*ref for ≥ two specialization levels

All examples in dtolnay's original post use two specialization levels, but sometimes it's desirable to have three or more levels -- especially since we are not limited by "strictly more specific".
Let's naively try to use three levels with this technique.
Instead of useful traits like `Display` we just use the traits `Ta`, `Tb` and `Tc` here.
`Ta` has the highest priority, i.e. if a type implements `Ta` it should dispatch via that impl, ignoring the other two; `Tb` has the second highest priority, and so on.
For our specialization trick we use this setup:

```rust
trait ViaA { fn foo(&self) { println!("A"); } }
impl<T: Ta> ViaA for T {}

trait ViaB { fn foo(&self) { println!("B"); } }
impl<T: Tb> ViaB for &T {}

trait ViaC { fn foo(&self) { println!("C"); } }
impl<T: Tc> ViaC for &&T {}
```

[If you try this](https://play.rust-lang.org/?version=stable&mode=debug&edition=2018&gist=4ac63d20a3d19dc291150c28a91e2ba0), you will see that this fails.
Assuming the type `Sc` only implements `Tc`, the call `(&Sc).foo()` results in "no method named `foo` found for type `&Sc` in the current scope".

This is simply because "autoref coercion" is only applied either zero or one time.
The compiler does *not* add potentially infinitely many `&`s until the receiver type matches.
Fortunately, there is a coercion that is automatically applied by method resolution, potentially multiple times: deref coercion.
With autoderef, the levels are ordered the other way around: higher priority impls have *more* references in their `Self` type.
In our example (`Ta` still having the highest priority):

```rust
impl<T: Ta> ViaA for &&T {}
impl<T: Tb> ViaB for &T {}
impl<T: Tc> ViaC for T {}
```

Another important difference is that our method call receiver has to have the same number of references as the `self` in the highest priority method.
In this case, we would need to have the method call expression `(&&&Sc).foo()`.
That is because `self` in `<&&T as ViaA>::foo` has the type `&&&T`.
Method resolution actually just cares about the type of `self`, and *not* `Self`!

Having too few `&` in the method call leads to strange errors (e.g. first and second priority switched).
This is due to method resolution trying receiver types in an unintuitive order.
For very detailed information about this, checkout [this beast of a StackOverflow post](https://stackoverflow.com/q/28519997/2408867) (one answer is mine).

With these adjustments, [our example now works as we wanted](https://play.rust-lang.org/?version=stable&mode=debug&edition=2018&gist=b95c7db29d933627b11fecfbe26c86d4).
By using autoderef instead of autoref, we can use as many specialization levels as we want.

<small>
(Amusingly, before writing this section, my generalized technique was still more complicated than this.
Specifically, I thought that due to the strangeness of method resolution, any two levels would be separated by *two* reference-layers; e.g. `ViaA for &&&&T` and `ViaB for &&T`.
By writing this post and testing things again, I noticed this simpler and more straightforward way.)
</small>




<br>
<br>
<br>
<br>

TODO:
- ...
