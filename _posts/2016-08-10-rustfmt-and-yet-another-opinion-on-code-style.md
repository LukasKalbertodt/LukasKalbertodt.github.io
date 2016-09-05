---
layout: post
title:  "Rustfmt and yet another opinion on code style"
date:   2016-08-10
---

In the last few weeks I was extensively using [`rustfmt`](https://github.com/rust-lang-nursery/rustfmt) in a medium sized project at my university, so I really got to know it.
In this post I will describe my impression of the quality of auto-formatting and my experiences with using `rustfmt` in continuous integration.
I will also share some opinions on code style that emerged from working with an auto-formatter.

<div class="tldr">
    <h1>The Gist</h1>
    <ul>
        <li>code should be simple to write, even without tools</li>
        <li>auto-formatters can't always do the right thing (yet)</li>
        <li>... thus they need to be able to deal with some degree of deviation from their static rule set</li>
        <li>code formatting checks in CI can work nicely, if done correctly</li>
        <li>running formatters on small portions of the code needs to be easy</li>
    </ul>
</div>

---

Over the last three weeks I was involved in a Rust project at my university (I will report about that in more detail in another post).
Around twenty people, who hadn't written a single line of Rust code before, were about to work on said project after learning some Rust basics.
Usually, programmers who are learning a new language tend to format code incorrectly which quickly leads to a rather ugly codebase -- a problem I wanted to tackle.

To solve this problem, I used `rustfmt` in our CI-scripts to check the code format of each PR and on each push. Sadly, we haven't been able to use [this feature](http://johannh.me/blog/rustfmt-ci.html) yet -- I wrote a rather hacky script, which just compared the formatted file with the original one.
If there was a difference, CI failed.
Additionally, most of us worked with an editor that automatically formats the code with `rustfmt` whenever the file is saved.


## The Good: `rustfmt` & CI improved the overall code style

Let's start with something positive: in the project at hand, using `rustfmt` really improved our code style.
A year ago I oversaw a similar project, in which we had not used `rustfmt`, and the codebase's style really suffered.
Many small problems appeared in the code written by most people.
Very often, whitespaces were forgotten or incorrectly put in places like:

- `baz(3,"hi",None)`
- `let foo:Type =3 ;` (even with one incorrect whitespace at the end)
- `fn bar()-> i32{ ... }`

I personally really suffer reading code like that.
This year, formatting errors like these had no chance of entering `upstream` (with very few minor exceptions).
Every time one of the Rust learners submitted a PR and the CI failed due to a formatting bug, it was legit.

This (so far) was a really satisfying experience.
When doing code review, I was pretty much able to concentrate on the semantics of the code instead of searching for incorrectly formatted code.
I think it really helped our project and I would do it again for any project, in which the majority of programmers is not experienced in the language.
However, not everything was great with this solution...


## The Bad: the trait bound `CodeStyle: Ord` is not satisfied

Everything was nice until either I or the other experienced Rust programmer in our team tried to push code.
The chance of us incorrectly formatting a piece of code is pretty low, but still: CI was failing.

As it turns out, `rustfmt` has a pretty rigid set of rules and often doesn't like anything that differs from these rules -- even if only slightly.
The code we were writing wasn't incorrectly formatted; I think no Rust programmer would have said "this is clearly wrong".
It was just different from what `rustfmt` had in mind.
Here is one example that `rustfmt` didn't like:

```rust
pillar.props().iter().map(|prop| {
    // do some stuff ...
}).collect()
```

It instead reformatted it to:

```rust
pillar.props()
    .iter()
    .map(|prop| {
        // do some stuff ...
    })
    .collect()
```

Is one version strictly better than the other one?
I don't think there is only one way to format this code correctly.
If the closure given to  `map` is a very complex one, you could prefer the first version (in which the closure's body is indented only one level) over the second one (with two levels of indentation).
If however, you are likely to add more iterator adaptors, then it makes sense to choose the second formatting.

My point here is, that formatting tools need to be more flexible.
With a rigid set of rules, it's difficult or even impossible to always find "the best" format for a given piece of code.
Hence, the formatter shouldn't reformat everything that doesn't exactly match the rules, but only reformat code which is *clearly* formatted incorrectly¹.
Otherwise the programmer will inevitably fight the formatting tool.

## The Ugly: humans know what they can read best

But it gets worse.
Sometimes, `rustfmt` really can't figure out how to properly format a piece of code.
Formatting is all about making code easier to read for *humans*.
Sadly, `rustfmt` is inherently non-human and has a hard time optimising certain code for humans.
Take this example:

```rust
[
    (((c & 0xFF0000) >> 16) as f32) / 255.0,
    (((c & 0x00FF00) >>  8) as f32) / 255.0,
    (((c & 0x0000FF) >>  0) as f32) / 255.0,
]
```

I hope you, my dear reader, agree with me that this code is correctly formatted.
More even: that it would have been worse writing `>>␣8` (only one whitespace) instead.
Let's look at another possible formatting:

```rust
[
    (((c & 0xFF0000) >> 16) as f32) / 255.0,
    (((c & 0x00FF00) >> 8) as f32) / 255.0,
    ((c & 0x0000FF) as f32) / 255.0,
]
```

In this second version I not only reduced `>>␣␣8` to `>>␣8`, but also removed the `>> 0`.
Since this bitshift isn't doing anything, the optimizer can simply remove it.
After all, "Programs should be written for people to read, and only incidentally for machines to execute." (from "Structure and Interpretation of Computer Programs" by Abelson and Sussman).

The bitshift as well as the additional spaces were added for alignment.
When portions of lines are aligned like that, we can quickly see the differences and similarities between those lines; in the second example this is not the case.
Note, that alignment is not always the proper tool to increase readability -- often syntax highlighting is sufficient already.
Variations from the standard formatting rule set should be rather rare, but they can't be avoided.
Thus, formatting tools need to be able to deal with those.


## The Important: Make code easy to write!

I think the most important point I want to bring across here is this: there is a formatting design of `rustfmt`, which I consider harmful (I know, this phrase is *sooo* 2014): alignment of lists at non-tabstops.
I often say that the exact rules for code formatting are far less important than the fact that everyone follows the same rules.
But in this case I think the rule itself is highly problematic².
Let me show an example:

```rust
falcon_nine.prepare_takeoff(&cape_canaveral,
                            dragon_v2,
                            &launch_codes);
```

Assuming this snippet can't be written in one line without exceeding maximum line width, this is the way `rustfmt` would format this function call.
As you can see, all arguments are aligned with the first argument and the first argument is in the same line as the function name.
This alignment obviously also tries to make it easier for humans to read the code, but I see several problems here:

- A lot of space on the left is wasted. If the arguments happen to be long expressions, we need to break those down into separate lines as well. This quickly becomes a problem and indeed, during the project we sometimes noticed ridiculous bad formatting in our code, because `rustfmt` wasn't able to split a piece of code into multiple lines properly ... only because of the wasted space left of the list.

- If we care about proper alignment, why don't we indent the `dragon_v2` one additional space to be aligned with the other variable names? There are quite a few different ways to align the arguments and again I think, that this is very difficult for a program to decide between those.

- The most important one: it's time-consuming for a programmer to format the code like this manually. Not everyone likes working with an auto-formatter and not everyone can. Being dependent on one specific tool limits the number of people willing or able to work on the code.

What do I mean by "time-consuming"?
When initially writing this function call, the programmer has to indent all arguments manually.
This needs to be done every time the variable or function name changes.
Trust me: I worked on said project without the `rustfmt` plugin for my editor and I tried to match the style manually.
It really *is* tedious work.

So how would I do it?

```rust
falcon_nine.prepare_takeoff(
    &cape_canaveral,
    dragon_v2,
    &launch_codes
);
```

We don't waste any space on the left and everything can be indented by simply pressing `[tab]` once.
Indentation is also independent from the function name or any other factors.

While this style can feel wrong for some at first, it doesn't suffer of any real, problematic downsides.
Look at another example take from our project this time:

```rust
let mut points = vec![ControlPoint {
                          point: start,
                          diameter: diam,
                      }];
```

Compared to this:

```rust
let mut points = vec![ControlPoint {
    point: start,
    diameter: diam,
}];
```

Or even this:

```rust
let mut points = vec![
    ControlPoint {
        point: start,
        diameter: diam,
    }
];
```

In the latter two versions, everything starts at a tabstop and thus can be reached quickly with the keyboard and not dependent on anything else.
This format beautifully matches the indentation around curly braces that everyone is used to.

<br />

---

<br />

I would love to have a helpful formatter in my editor!
However, `rustfmt` isn't (yet) this helpful formatter I dreamt of.
Too often it interfered with me and made the programming experience worse for me.
I worked with `clang-format` for some time and really liked the feature that allowed formatting only one small region around a specific location.
Sure, you can tell `rustfmt` to only format in a specific range.
But in my editor I just want to say "please format the semantically connected piece of code around my cursor position".

I hope this report can bring some new and helpful insights to the Rust community.
It's a really great thing that the whole community pretty much uses one style, as it allows everyone to quickly read everyone else's code.
A style variety like in the C++ land is definitely not desirable.
To further improve this code style unity, many people are already working on an official style guide.
I really do hope that in this process, no decisions are being made that have serious negative side effects, such as making it difficult to manually format code idiomatically.

---

<small>
¹ there is `#[rustfmt_skip]`, but it only works on nightly and I don't really think that the configuration of a tool belongs into the code.
</small>

<small>
² `rustfmt` can be configured (with limitations, of course), but I think the default matters a lot.
</small>
