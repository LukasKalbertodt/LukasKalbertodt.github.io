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

# Long awaited type system features

This should be the focus of work in 2020.
Particularly, these features:

- [**Generic Associated Types**](https://github.com/rust-lang/rust/issues/44265): implement in 2020.
- [**Const generics**](https://github.com/rust-lang/rust/issues/44580): polish the current implementation and stabilize (at least a subset of) it in 2020.
- [**Specialization**](https://github.com/rust-lang/rust/issues/31844): figure out how to make it sound and stabilize (at least a subset of) it in 2020.

*Note*: I'm not saying that this will be easy (it won't) or that people haven't invested time into this already (people have).
I'm just saying it is important and should be prioritized.
And -- from my half-informed point of view -- I think the 2020 goals above are possible.

I think these features are important because we want to **bridge the gap between the type system of C++ and Rust**.
There are currently a number of situations where one can create a "nice" API in C++, but not in Rust.
Situations in which C++ is a better choice than Rust, because Rust is simply lacking features.
Additionally, **these type system feature are required for a number of other much-desired features**, like `impl Trait` in trait methods and `async` trait methods.

One problem with these features is that implementing them requires in-depth knowledge of the compiler and Rust's type system.
There aren't particularly many people right now that could implement these features, let alone people who also have the time for it.



<br>

# Finish what we started

Apart from the features mentioned above, there are plenty of other features that we should try pushing over the finish line (by stabilizing them).
As time of this writing, there are [**173 issues tagged with `C-tracking-issue` and `B-unstable`**](https://github.com/rust-lang/rust/issues?q=is%3Aopen+is%3Aissue+label%3AC-tracking-issue+sort%3Acomments-desc+label%3AB-unstable).
I suspect that many of those features are already very close to stabilization and just require a few final touches and a decision.
I don't think having that many features in flight is a good thing.

Let's maybe try getting that number **below 150 by the end of 2020**. That means we have to stabilize more features than we add. That would be great!
