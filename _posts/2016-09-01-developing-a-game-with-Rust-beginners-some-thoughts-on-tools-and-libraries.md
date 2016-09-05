---
layout: post
title:  "Developing a game with Rust beginners – some thoughts on tools and libraries"
date:   2016-09-01
---

Like last summer, I oversaw a three week programming practical at the University of Osnabrück, Germany -- this time focussed on computer graphics. My group created an open-world exploration game called "Plantex", in which all content is procedurally generated. This means, our game doesn't need any static assets: the terrain, textures, plants and other objects are generated from a single integer seed. Only one of the 23 students knew Rust before, everyone else learned it during the first few days. In this post, I will share experiences and thoughts from the practical.

<div class="tldr">
    <i>Note</i>: you can find the game <a href="https://github.com/OsnaCS/plantex">on GitHub</a>. Please keep in mind that most code was written by Rust beginners, so it's probably far from optimal.
</div>

---

![bla](/assets/ferris-overview.jpg)
*Ferris overseeing the practical :)*

Unlike in [my post about the last practical]({% post_url 2015-10-09-building-an-sql-database-with-10-rust-beginners %}), I won't really describe the practical itself here.
I will rather quickly describe our experience with the tool `rustfmt` and the library `glium` as well as mention some thoughts on the language Rust itself.
These three topics are not linked to one another in any way and don't really have anything to do with the game that was developed.
If you just want to check out the project, you should [click here](https://github.com/OsnaCS/plantex).


## Glium

Our game uses OpenGL through [`glium`](https://github.com/tomaka/glium).
In my opinion, `glium`'s philosophy of being safe and reasonably fast is great.
However, during the practical we had mixed emotions about it:
I regularly heard complaints about its documentation: sometimes it's really great and describes certain features in great detail, but at other times it's too short, non-existent or deprecated.

Sometimes, `glium` is pretty slow, too. For example, it uses many `HashMap`s with the default hasher internally. This is really surprising, given that `glium` uses overly complicated designs to improve performance at other places. Take [this type level list](http://tomaka.github.io/glium/glium/uniforms/struct.UniformsStorage.html) to store uniform values, for example. Later, those uniforms are put into a `HashMap` anyway. [At one point we were able to improve our performance by ≈30%](https://github.com/OsnaCS/plantex/commit/98ca93633d75c429ce8316ab24a49c9a3770521e#diff-02d32d0e6561d35ac67d54da3ba54a1d) by simply using a `glium` fork that uses an FNV hasher instead of Rust's default SIP hash.

Additionally, `glium` has not implemented all OpenGL features yet. This is really annoying sometimes, as you can imagine.
To me, `glium` feels like it's still in the middle of development.
Sure, it's not 1.0 yet, but it's *the* OpenGL wrapper in the Rust world.
The idea is great, but I believe, it still needs a lot of work.

Don't get me wrong, I really admire `tomaka` for his work on so many interesting and great Rust libraries.
But I think, game development is be pretty important for Rust, and that one programmer is simply not enough to maintain and work on an OpenGL wrapper, a [Vulkan wrapper](https://github.com/tomaka/vulkano), a [cross-platform window library](https://github.com/tomaka/glutin), ...


## Continuous integration and `rustfmt`

Like many Rust projects, we used the CI service "Travis-CI" to protect our code base.
Unfortunately, it's rather difficult to properly test a game in CI; we didn't even find an easy way to validate our GLSL shaders on Travis-CI.
But at least we checked the code style with `rustfmt`.
I wrote in much greater detail about our experience with `rustfmt` (and CI) in [my previous post]({% post_url 2016-08-10-rustfmt-and-yet-another-opinion-on-code-style %}).

![bla](/assets/ferris-beamer.jpg)
*This Ferris plushie was sewed by a friend of mine with [this tutorial](http://edunham.net/2016/04/11/plushie_rustacean_pattern.html)*

## Conversions between primitive types in Rust

For a long time, but especially during the practical, I  have been learning to hate `as` casts.
They tell you so little about what the programmer intended.
I was happy to see many `Into`/`From` impls for safe number  conversions.
However, I haven't really been able to use them often, because more often than not conversions I wanted to perform weren't safe.

When reviewing an `as` cast, I can't know if the programmer knew about all side effects.
Could this overflow or is it always safe?
Is an overflow intended?
Do we lose precision?
In one PR I saw this:

```rust
let seed0 = (rng_seed >> 32) as u32;
let seed1 = rng_seed as u32;
```

Judging from the code, `rng_seed` can be bigger than `u32::max_value()`.
But is the code's author aware of the fact the second line discards information?
You could make it explicit by writing `(rng_seed & 0xFFFFFFFF) as u32`, but I think there could be better ways.
For example:

```
let seed1: u32 = rng_seed.truncate();
```

In the code I'm talking about, the type annotation is not even necessary.
I really hope to get some conversion methods for primitive types that clearly state what they are doing (e.g. `widen()`, too).
First, we wanted to write an RFC during the practical, but discarded the idea due to time limitations.

<br />

---

Hopefully a few thoughts mentioned here will be interesting for the Rust community. You can discuss this post [on reddit](https://www.reddit.com/r/rust/comments/519qku/plantex_an_openworld_exploration_game_with/d7aaex7), if you want.

Personally, I am pretty satisfied with the result of this practical; you should certainly check out the game!
This was probably the last programming practical I will oversee at this university, but I will give a Rust course in the semester starting in two months.
I'm planning to report about that in the future!
