---
layout: post
title:  "Rust 2020: Power to the Type System"
date:   2019-11-13
---

This article does not contain any *new* ideas for #Rust2020, but I still wanted to voice my opinion and support some ideas from other posts.
Let's keep it brief then.


<div class="tldr" markdown="1">
# 🔑 Key takeaways
- Implement GATs
- Stabilize (parts of) const generics and specialization
- Push more features over the finish line
</div>

## Long awaited type system features

This should be the focus of work in 2020.
Particularly, these features:

- [**Generic Associated Types**](https://github.com/rust-lang/rust/issues/44265): implement in 2020.
- [**Const generics**](https://github.com/rust-lang/rust/issues/44580): polish the current implementation and stabilize (at least a subset of) it in 2020.
- [**Specialization**](https://github.com/rust-lang/rust/issues/31844): figure out how to make it sound and stabilize (at least a subset of) it in 2020.

*Note*: I'm not saying that this will be easy (it won't) or that people haven't invested plenty of time into this already (people have).
I'm just saying it is important and should be prioritized.

I think these features are essential because we should **bridge the gap between the type system of C++ and Rust**.
There are still several things that *can* be ex-pressed in C++, but not in Rust, because Rust's type system lacks some type-level tools.
I personally found myself in such a situation a couple of times already and I can assure you that trying to find a workaround eats up *lots* of development time.
And we would't want people choosing C++ instead of Rust because of that, right?
Additionally, **these type system features are required for a number of other much-desired additions to the language**, like `impl Trait` in trait methods and `async` trait methods.

One difficulty with GATs, const generics and specialization is that implementing them requires in-depth knowledge of the compiler and Rust's type system.
There aren't particularly many people right now that *could* implement these features, let alone people who also have the time to actually do it.



<br>

## Finish what we started

Apart from the features mentioned above, there are plenty of other features that we should try pushing over the finish line (by stabilizing them).
As time of this writing, there are [**175 issues tagged with `C-tracking-issue` and `B-unstable`**](https://github.com/rust-lang/rust/issues?q=is%3Aopen+is%3Aissue+label%3AC-tracking-issue+label%3AB-unstable).
I suspect that many of those features are already very close to stabilization and just require a few final touches and a decision.
I don't think having that many features in flight is a good thing.

While I know that such a number is absolutely not a great indicator, let's maybe try getting that issue count **below 150 by the end of 2020**. That means we have to stabilize more features than we add. That would be great!
