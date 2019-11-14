---
layout: post
title:  "Thoughts on Error Handling in Rust"
date:   2019-11-14
---

A programming language's solution to *error handling* significantly influences the robustness, brevity, readability and -- to an extent -- the runtime performance of your code. Consequently, the error handling story is an important part of PL design. So it should not come as a surprise that the Rust community constantly discusses this topic. Given some recent discussions and the emergence of [more][fehler] [and][snafu] [more][anyhow] error handling crates, this article shares some of my thoughts (not solutions!) on this.

[fehler]: https://github.com/withoutboats/fehler
[snafu]: https://github.com/shepmaster/snafu
[anyhow]: https://github.com/dtolnay/anyhow

<div class="tldr" markdown="1">
# 🔑 Key takeaways
- "Anonymous sum types" would be a great tool for error handling.
- We might want to explicitly distinguish between errors intended for an application's user and errors intended to be handled by code.
- In my opinion, Rust's error handling story is fine, but could still be improved.
</div>


---

To mention this up-front, this article will **not** talk about:

- **Programming errors/bugs**: as nicely explained in [the article "The Error Model" by Joe Duffy](http://joeduffyblog.com/2016/02/07/the-error-model/), bugs should be treated differently from "recoverable errors". In particular, we want to immediately tear down the current unit of isolation (process or thread) upon encountering a bug. The article calls this "abandonment". Rust follows this philosophy with *panics*; a fine solution in my opinion. The rest of this article will only talk about errors that are not bugs.

- **Runtime performance**: this article will only talk about error handling as seen by the programmer and *not* what the code compiles to. I even think it might be possible to decouple both concerns: just because at the language level, it looks like return-based error handling, doesn't mean the generated machine code has to work that way. But that's a rabbit hole for another time.


If you already know what the error handling discussion is all about, you can skip right to ["Some thoughts"](#some-thoughts).

<br>


# The state of error handling

To recap, we have mainly three tools related to error handling in the core language or standard library:

- **`Result<T, E>`** which is returned by functions that can fail,
- **the `Error` trait** which abstracts over error types, and
- **the `?` operator** which offers a short syntax to delegate errors to the calling function (and potentially convert between error types).

While many people from the Rust community think that these tools are sufficient for good error handling, many others disagree and would like to have more or better features. To understand what could be improved, let's consider a tiny example:

```rust
use std::{fs, io, path::Path};

fn load_config_value(path: &Path) -> Result<String, io::Error> {
    fs::read_to_string(path)
}
```

Now consider this configuration value is supposed to be a positive integer. So the function should return `Result<u64, _>`:

```rust
use std::{fs, io, path::Path};

fn load_config_value(path: &Path) -> Result<u64, io::Error> {
    fs::read_to_string(path)?
        .parse()
}
```

Unfortunately, this won't work: `parse` returns a `ParseIntError` (in this case), but the function returns an `io::Error`. So how to solve this?

- *Non-solution*: panicking (panicking is for bugs only).
- *Non-solution*: converting the error into a string and return `Result<_, String>` (loss of semantic information, should be avoided).
- Creating a custom `enum { Io(io::Error), Parse(ParseIntError) }`.
- Use a type erased error type like:
    - `Box<dyn std::error::Error>`
    - `failure::Error`
    - ... and others

Creating a custom enum is the "purest" solution as the function's return type now precisely defines what errors can occur. *However*, creating enum types can become verbose quickly. On the other end of the spectrum, we have abstract types like `Box<dyn std::error::Error>`, which do not tell us anything about what kind of errors can occur. They (together with `Result`) just tell us *that* an error can occur.

Many libraries use something in between: they define an `enum Error` that serves as the error type for the whole library and lists all possible errors that can originate from that library. Users at least know something about what errors to expect and the library does not have to define countless custom error types. This, however, is just a compromise and by no means perfect.



# Some thoughts

Looking at what popular error handling crates offer, we can list features that people seem to miss in the tools offered by the standard library:

- Creating custom error types with `Display` impl easily without a lot of code (e.g. via `#[derive(...)]`).
- Adding context to an error.
- Storing a backtrace with the error.
- Creating an error from a string.

The different libraries seem to target different use-cases, though. For example, `snafu` with its strongly typed errors and contexts seems to be a good fit for *libraries*. On the other hand, `anyhow` with its focus on the type-erased `Error` and on creating string errors and contexts seems to be more useful for *applications*. **Errors produced by libraries need to be understood by other code, errors produced by executables need to be understood by humans.**

A commonly requested language feature is "automatic `Ok(_)` wrapping": this would mean the programmer doesn't have to write `Ok(my_output)` or `Ok(())` anymore. People in favor of this feature argue that `Ok(_)` only distracts from the happy path and is annoying, while others would like to keep the explicitness of the current system.



## *Three* types of errors

As mentioned above, ["The Error Model"](http://joeduffyblog.com/2016/02/07/the-error-model/) distinguishes between two types of "errors": bugs and recoverable errors. I fully agree with that idea, but I feel that -- for applications (not libraries) -- there is another clear distinction of two kinds of "recoverable errors":

- errors that are *actually handled* by the application, and
- errors that are *merely reported* to the user of the application.

Libraries can't know whether their errors are handled or forwarded to a human, but applications do know.

In my attempts to report as much useful error information to the user as possible, I always end up with almost every function returning `Result<_, failure::Error>`. Since the errors are only reported to the user in string form, I don't care about strong typing. But in that case, the explicit return type is not worth a lot: all functions returning the same error does not convey a lot of semantic information. And for these functions, manually writing `Ok(_)` really feels like a chore without any benefit. *On the other hand*, for errors that are intended to be dealt with, the explicit `Result` and `Ok(_)` seem very useful.

So *maybe* the Rust community's disagreement on automatic `Ok(_)` wrapping and other error handling topics partially stems from simply talking about different kinds of errors? Just like bugs should be treated differently, **_maybe_ we should find different solutions for the two types of "recoverable errors"?**


## Ad-hoc anonymous sum-types

This is by no means a new idea. There have been a few pre-RFCs and one RFC ([text](https://github.com/eaglgenes101/rfcs/blob/2c8e89811a64b139a62d199c5f8e5bd3e852102c/text/0000-anonymous-variants.md), [discussion](https://github.com/rust-lang/rfcs/pull/2587)) which was postponed. I feel like anonymous sum types are something we certainly want in the core language for many different reasons. The symmetry with product types just makes the idea feel so "right". But that feature is especially interesting for error handling. Revisiting the example above:

```rust
//                                               vvvvvvvvvvvvvvvvvvvvvvvvv
fn load_config_value(path: &Path) -> Result<u64, io::Error | ParseIntError> {
    fs::read_to_string(path)?
        .parse()
}
```

That way it would be super easy to explicitly list all kinds of errors that can occur while not being forced to write a lot of boilerplate code or use an error handling crate.

Anonymous sum types still require a lot of design work and are no-where near to being implemented. But I still think we should not forget their potential  when talking about error handling.

<br>
<br>

---

This article has no conclusion, as it's just a loose collections of thoughts, which might or might not be useful to someone.
