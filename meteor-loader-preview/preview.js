(function () {
  'use strict';

  var container = document.getElementById('meteor-loader');
  var replay = document.getElementById('replay');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var animation = window.lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: !reduceMotion,
    autoplay: !reduceMotion,
    path: './falling-meteor.json',
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet',
      progressiveLoad: true,
      hideOnTransparent: true
    }
  });

  if (reduceMotion) {
    animation.addEventListener('DOMLoaded', function () {
      animation.goToAndStop(84, true);
    });
  }

  replay.addEventListener('click', function () {
    animation.goToAndPlay(0, true);
  });
})();
