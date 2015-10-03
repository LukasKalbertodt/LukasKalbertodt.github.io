---
layout: post
title: "I don't even programming"
date:   2015-10-03
---

*Exactly 8 pm. Exactly at  8pm the online sign-up form would be activated, the professor had said. And exactly then his students, including my girlfriend, would be able to sign up for their favourite time slot. This is precisely the level of accuracy you would expect from a German university professor. And this is precisely what did not happen that evening.*

After half an hour, uncertainty spread throughout the already confused freshmen. I reassured my girlfriend that professors forgetting something like that is no exception – rather the opposite is. Unfortunately our evening plans did not entirely consist of pressing `F5` every three seconds, so I felt like I could [finally use my computer science power in real life][xkcd].

I quickly fired up my editor, typed `#!/bin/sh` into it (because I am so proud of finally remembering the shebang) and started the chrome developer tools. The latter allow to serialize an HTTP request (with cookies and everything) into a `curl` command. Perfect for my purpose!

But how to get the HTTP request I wanted? As it turned out, the system is designed to prevent those kinds of automated sign-ups… or at least make them harder. But I figured it would be enough for the script to notify us when the process had finally been activated; we could pause the movie we'd be watching to sign up manually.

To detect if the sign-up is already activated I searched the HTTP response for a string describing the sign-up button. From her account I couldn't possibly know how the button would look like. So I looked through my courses (same university, same course management tool) to find a similar button – which I luckily found. Nearly done! Then I just (successfully) tested both, the `curl` and `grep` command, with my account.

How should the script notify us during the movie? Maybe play some sound or open some system popup? Nah, the code was already *quick 'n dirty*, so why bother reading documentation? Starting some application like… uhm… Blender ought to be enough, right?

Finally, with everything prepared and the script started: movie time!

Two hours later: still no sign of Blender, although the script was still running properly. How odd. Had the professor completely forgotten about the sign-up today? A look at the online tool quickly convinced us: he had not. My script had not worked. Dang it!

So what *did* fail? Wrong HTTP request? Invalid session cookie? Broken internet connection? Faulty `grep` command? Magic? <br>
No, it was none of those things. My account in the course management tool still had the default configured language: German. Her tool was in English. The button string I searched for contained the button label – in German. *Sigh*.


[xkcd]: https://xkcd.com/208/
