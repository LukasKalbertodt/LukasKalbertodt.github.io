function addRandomEmojiTimer() {
    var elem = document.getElementById('header-desc-inner');
    if (elem) {
        // Meh, now you found my secret list of awesome symbols :(
        var options = [
            '🦀',
            '❤',
            '♫',
            '🍂',
            '🐼',
            '🐧',
            '🐢',
            '🐁',
            '🐻',
            '🧀',
            '🍉',
            '🍆',
        ];

        elem.innerHTML = options[Math.floor(Math.random() * options.length)];
    }

    setTimeout(arguments.callee, 30000);
}

function addCommentsListener() {
    var elem = document.getElementById("show-all-button");
    elem.onclick = function(e) {
      document.getElementById("comments-container").style.maxHeight = "inherit";
      document.getElementById("comments-gradient").style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", function(event) {
  addRandomEmojiTimer();
  addCommentsListener();
});
