---
layout: post
title:  "Tauri vs Iced vs egui: Rust GUI framework performance comparison (including startup time, input lag, resize tests)"
date:   2023-02-03
---

Recently I found myself in need of doing GUI with Rust, so I researched and experimented a bit.
In this post, I want to share the data I collected, as it might help others.
I will mostly compare Tauri, Iced and egui as those seem to be popular choices.
I spent quite a bit of time performing tests to assess the speed/performance of these libraries, as a snappy UI experience is something I really value.


<div class="tldr" markdown="1">
# 🔑 Key takeaways
- All three are likely fast enough for most cases.
- Tauri falls slightly behind Iced and egui in terms of startup time and resize performance (on my machine).
</div>

**Note**:
This is by no means a full comparison!
There are certainly important aspects that are not mentioned in this post.
Also be sure to read the disclaimer regarding my performance tests!
If you find any factual error, please let me know so that I can fix the post :)

# Quick introduction

- [Tauri](https://tauri.app/):
  Uses the webview by the OS to render an HTML/JS frontend.
  You can chose any frontend framework (JS or Rust).
  "Backend" is written in Rust, can communicate with frontend via built-in methods.
- [Iced](https://iced.rs/):
  Elm-inspired (reactive) GUI library.
  Uses wgpu for rendering on desktop; experimental web backend to create DOM for rendering.
  All code in Rust.
- [egui](https://github.com/emilk/egui):
  Immediate mode GUI using OpenGL for custom rendering.
  All code in Rust.

# Comparison

<div class="full-width-container">
    <table class="framework-comparison">
        <tr>
            <th width="270px">Statistics</th>
            <th width="33%">Tauri</th>
            <th width="33%">Iced</th>
            <th width="33%">egui</th>
        </tr>
        <tr>
            <td>GitHub</td>
            <td>60k★, used by 10k</td>
            <td>18k★, used by 2k</td>
            <td>13k★, used by 6k</td>
        </tr>
        <tr>
            <td>crates.io downloads (recent/all-time)</td>
            <td>145k / 485k</td>
            <td>30k / 180k</td>
            <td>135k / 600k</td>
        </tr>
        <tr class="table-sep"></tr>
        <tr>
            <th class="table-heading">Architecture & Implementation</th>
            <th>Tauri</th>
            <th>Iced</th>
            <th>egui</th>
        </tr>
        <tr>
            <td>Programming model</td>
            <td>Depends on chosen frontend-framework</td>
            <td>Elm-like/reactive</td>
            <td>Immediate mode</td>
        </tr>
        <tr>
            <td>Desktop</td>
            <td>🟢 via OS webview</td>
            <td>🟢 wgpu-based</td>
            <td>🟢 backend-agnostic, default backend is OpenGL-based</td>
        </tr>
        <tr>
            <td>Web</td>
            <td>🔴 not built-in, manual setup possible</td>
            <td>🟠 experimental, via <a href="https://github.com/iced-rs/iced_web"><code>iced_web</code></a></td>
            <td>🟠 via WebGL<sup>†</sup></td>
        </tr>
        <tr class="table-sep"></tr>
        <tr>
            <th class="table-heading">Subjective Ratings</th>
            <th>Tauri</th>
            <th>Iced</th>
            <th>egui</th>
        </tr>
        <tr>
            <td>Stability/Maturity</td>
            <td>🟢 1.0, big community, has sponsors, multiple devs, has Governance page</td>
            <td>🟠 0.7, "experimental", active development since 2019, used a lot</td>
            <td>🟠 0.20, “in active development”, “interfaces in flux”, “lacks features”, active development since 2019, mainly one dev, used a lot</td>
        </tr>
        <tr>
            <td>Documentation</td>
            <td>Fairly good; lots of templates; could use more guide-level docs for backend; crate docs could be better</td>
            <td>Good crate docs, but lacking guide-level docs; "book" basically non-existent; many examples</td>
            <td>Good crate docs; many examples</td>
        </tr>
        <tr>
            <td>DX</td>
            <td>🟢 Frontend instant reload; browser dev tools; good CLI tools</td>
            <td>🟠 Always recompile; debug overlay with performance metrics</td>
            <td>🟠 Always recompile</td>
        </tr>
        <tr class="table-sep"></tr>
        <tr>
            <th class="table-heading">
                Performance on my machine
                <div style="font-size: smaller; line-height: 1;">(see disclaimer below!)</div>
            </th>
            <th>Tauri</th>
            <th>Iced</th>
            <th>egui</th>
        </tr>
        <tr>
            <td>Startup time</td>
            <td>≈380ms (window after ≈125ms)</td>
            <td>≈230ms (window after ≈33ms)</td>
            <td>≈280ms</td>
        </tr>
        <tr>
            <td>Input delay (frame = 16ms)</td>
            <td>2–3 frames</td>
            <td>3 frames</td>
            <td>2 frames</td>
        </tr>
        <tr>
            <td>Resize</td>
            <td>🟠 10–15fps</td>
            <td>🟡 12-30fps</td>
            <td>🟡 12-30fps</td>
        </tr>
        <tr>
            <td>Binary size</td>
            <td>5MB</td>
            <td>17MB</td>
            <td>18MB</td>
        </tr>
    </table>
</div>

<small>
    † Using a canvas-based renderer on the web is not optimal for a number of reasons (not being able to ctrl+f, inputs being weird, ...).
    See [here](https://github.com/emilk/egui/tree/master/crates/eframe#problems-with-running-egui-on-the-web) for more information.
</small>



# Performance

## Important disclaimer
Everything was measured on my Ubuntu 20.04, Gnome 3.36.8, X11, Nvidia proprietary drivers, without animations (disabled in Gnome Tweaks).
60Hz monitor (which doesn’t matter as Gnome does not support >60hz 😑).
I hardly changed any desktop/Gnome configuration, but still: the setup could be borked for any number of reasons (#linux).
The fact that moving windows around was not always 60fps is already an indicator that something is wrong.

**Do not** interpret these performance metrics as a universal statement about these GUI libraries.
I have not even tested Windows or macOS, which could behave wildly different.

## Methodology

All of these measurements were taken by recording the full screen with *OBS*, then counting frames in *Avidemux*.
Programs used:

- Tauri: `helloworld` example at `7e8e0e76ec`.
- Iced: `todos` example at `98a717383a` (yes, I should have used "hello world", too, but I don't think it makes a difference in this case).
- egui: `hello_world` example at `5725868b57`.
- Sublime Text Build 4143 with a project and many tabs open.
- VS Code 1.74.3 with home directory opened in the side browser, but hardly any tabs.
- xclock

The first three I compiled myself with `cargo build --release`.
The last three I included for comparison.
I mainly use Sublime Text, an editor using a custom UI framework, which is often praised for its snappy UI.
VSCode is a very popular editor that uses Electron, which is often criticized for being slow and sluggish.
I figured `xclock` is a super low level UI application, without any framework, using X calls directly.

And yes, I realize this is not a fair comparison for Sublime Text and VSCode, as they are useful programs with lots of data loaded, instead of minimal examples.
I still think the comparison is useful.

## Startup time

Binaries were directly started from the terminal (no `cargo` or `npm` used).
I counted the frames from the moment my "Enter" press was drawn by the terminal until the window appears/the final UI is rendered.
This is not an exact measurement of the absolute perceived startup time, but it's useful for a relative comparison.
Numbers are in ms, one number per test/trials.

<div class="full-width-container">
    <table class="framework-comparison">
        <tr>
            <th width="80px"></th>
            <th width="210px">Final render</th>
            <th width="190px">Window appears</th>
            <th width="120px">Visual jumps</th>
            <th>Behavior of window contents</th>
        </tr>
        <tr>
            <td><b>Tauri</b></td>
            <td>366, 417, 400</td>
            <td>100, 134, 150</td>
            <td>1</td>
            <td>First grey, then final UI</td>
        </tr>
        <tr>
            <td><b>Iced</b></td>
            <td>333, 217, 266, 217, 217</td>
            <td>33, 33, 33, 33, 50</td>
            <td>1</td>
            <td>First black, then final UI</td>
        </tr>
        <tr>
            <td><b>egui</b></td>
            <td>300, 200, 283, 300, 250</td>
            <td>🠔</td>
            <td>0</td>
            <td>Final UI from the start</td>
        </tr>
        <tr>
            <td><b>xclock</b></td>
            <td>66, 100, 84</td>
            <td>🠔</td>
            <td>0</td>
            <td>Final UI from the start</td>
        </tr>
        <tr>
            <td><b>Sublime</b></td>
            <td>450, 450, 467</td>
            <td>🠔</td>
            <td>0</td>
            <td>Final UI from the start</td>
        </tr>
        <tr>
            <td><b>VSCode</b></td>
            <td>1450, 1250, 1450</td>
            <td>500, 484, 517</td>
            <td>4</td>
            <td>First grey, after 180ms blue, one frame later three color areas (roughly resembling the layout), roughly 400ms later  almost final UI, 130ms later icons are drawn</td>
        </tr>
    </table>
</div>

## Resizing

App was horizontally resized (changing its width).
FPS was determined by looking at the recording and counting frames between changes.
By "decorations" I mean the window title bar with close buttons and the like.

<div class="full-width-container">
    <table class="framework-comparison">
        <tr>
            <th width="80px"></th>
            <th>Resize FPS</th>
            <th>Behavior</th>
        </tr>
        <tr>
            <td><b>Tauri</b></td>
            <td>≈10–15 fps</td>
            <td>UI lags behind window</td>
        </tr>
        <tr>
            <td><b>Iced</b></td>
            <td>≈12–30</td>
            <td>UI in sync with window. Funnily, decorations lag behind</td>
        </tr>
        <tr>
            <td><b>egui</b></td>
            <td>≈12–30</td>
            <td>UI in sync with window</td>
        </tr>
        <tr>
            <td><b>xclock</b></td>
            <td>≈20–30</td>
            <td>UI in sync with window</td>
        </tr>
        <tr>
            <td><b>Sublime</b></td>
            <td>≈20–30</td>
            <td>UI in sync with window</td>
        </tr>
        <tr>
            <td><b>VSCode</b></td>
            <td>≈8–12</td>
            <td>UI lags behind window (sometimes black replacement, sometimes blue)</td>
        </tr>
    </table>
</div>


## Input lag

For each application I pick an element that changes color on hover.
I count how many frames the cursor is over said element without the element changing color.
The cursor is also recorded by OBS: I don't know how exact this is, but the cursor sometimes seemed to lag/skip a frame in the recording.
So take this, as everything else, with a grain of salt.

Input lag in frames (each tested multiple times):

- **Tauri**: 3, 2, 2, 3, 3, 3, 3
- **Iced**: 3, 3, 3, 3, 3, 3, 3
- **egui**: 2, 2, 2, 2, 2, 2
- **Sublime**: 2, 2, 2, 3, 2
- **VSCode**: 3, 4, 6, 3, 3, 6

## Scrolling smoothness

I checked Tauri, Sublime Text, and VSCode and all three scroll with 30–60fps.
Sublime hits the 60fps more often than the other two, but also skips a frame from time to time.


