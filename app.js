/* Медиакоми — логика игры «Угадай цену квартиры» */
(function () {
  'use strict';

  var ROUNDS = 10;
  var SLIDER_MIN = 50000;
  var SLIDER_MAX = 2000000;
  var SLIDER_STEP = 5000;

  // Балльная система: чем ближе оценка к реальной цене, тем больше баллов
  function pointsFor(guess, real) {
    var err = Math.abs(guess - real) / real; // доля ошибки
    if (err <= 0.05) return 10;
    if (err <= 0.10) return 8;
    if (err <= 0.20) return 6;
    if (err <= 0.35) return 4;
    if (err <= 0.60) return 2;
    return 0;
  }

  function fmt(n) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
  }
  function fmtShort(n) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n));
  }

  function $(id) { return document.getElementById(id); }

  // ---------- Состояние ----------
  var deck = [];        // 10 лотов текущей игры
  var round = 0;        // индекс текущего раунда (0-based)
  var results = [];     // {guess, real, points}
  var answered = false;

  // ---------- Экраны ----------
  function showScreen(name) {
    ['screen-start', 'screen-game', 'screen-final'].forEach(function (id) {
      $(id).classList.add('screen--hidden');
    });
    $(name).classList.remove('screen--hidden');
    window.scrollTo(0, 0);
  }

  function setProgress() {
    var fill = $('progressFill');
    var meta = $('topbarMeta');
    if (round === 0 && results.length === 0) {
      fill.style.width = '0%';
      meta.textContent = '';
      return;
    }
    var done = results.length;
    fill.style.width = (done / ROUNDS * 100) + '%';
    if (done < ROUNDS) {
      meta.textContent = 'Раунд ' + (done + 1) + ' / ' + ROUNDS;
    } else {
      meta.textContent = 'Раунд ' + ROUNDS + ' / ' + ROUNDS;
    }
  }

  // ---------- Галерея ----------
  var gallery = {
    track: $('galleryTrack'),
    dots: $('galleryDots'),
    count: 0,
    build: function (photos) {
      var self = this;
      this.track.innerHTML = '';
      this.dots.innerHTML = '';
      this.count = photos.length;

      photos.forEach(function (src, i) {
        var slide = document.createElement('div');
        slide.className = 'gallery__slide';
        var img = document.createElement('img');
        img.loading = i === 0 ? 'eager' : 'lazy';
        img.decoding = 'async';
        img.alt = 'Фото квартиры, ' + (i + 1);
        img.onerror = function () {
          slide.classList.add('gallery__slide--error');
          img.remove();
        };
        img.src = src;
        slide.appendChild(img);
        self.track.appendChild(slide);

        var dot = document.createElement('button');
        dot.className = 'gallery__dot';
        dot.setAttribute('aria-label', 'Фото ' + (i + 1));
        dot.addEventListener('click', function () { self.go(i); });
        self.dots.appendChild(dot);
      });

      this.sync();
      this.track.scrollLeft = 0;
    },
    go: function (i) {
      i = Math.max(0, Math.min(this.count - 1, i));
      var slide = this.track.children[i];
      if (slide) this.track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
    },
    sync: function () {
      var idx = Math.round(this.track.scrollLeft / this.track.clientWidth);
      var dots = this.dots.children;
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('gallery__dot--active', i === idx);
      }
    }
  };

  gallery.track.addEventListener('scroll', function () {
    window.requestAnimationFrame(function () { gallery.sync(); });
  }, { passive: true });

  $('galleryPrev').addEventListener('click', function () {
    gallery.go(Math.round(gallery.track.scrollLeft / gallery.track.clientWidth) - 1);
  });
  $('galleryNext').addEventListener('click', function () {
    gallery.go(Math.round(gallery.track.scrollLeft / gallery.track.clientWidth) + 1);
  });

  // ---------- Бегунок ----------
  var slider = $('priceSlider');
  function paintSlider() {
    var pct = (slider.value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN) * 100;
    slider.style.setProperty('--fill', pct + '%');
    $('guessValue').textContent = fmt(+slider.value);
  }
  slider.addEventListener('input', paintSlider);

  // ---------- Игра ----------
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startGame() {
    deck = shuffled(LISTINGS).slice(0, ROUNDS);
    round = 0;
    results = [];
    setProgress();
    showRound();
  }

  function showRound() {
    answered = false;
    var lot = deck[round];
    setProgress();

    gallery.build(lot.photos);
    // Прогреваем первое фото следующего лота, чтобы не тормозило
    if (round + 1 < deck.length && deck[round + 1].photos.length) {
      var pre = new Image();
      pre.src = deck[round + 1].photos[0];
    }

    $('lotStreet').textContent = lot.street || 'Республика Коми';
    $('lotDesc').textContent = lot.desc;

    slider.value = 400000;
    slider.disabled = false;
    paintSlider();

    $('guessBlock').classList.remove('screen--hidden');
    $('resultBlock').classList.add('screen--hidden');
    showScreen('screen-game');
  }

  function commentFor(errPct, guess, real) {
    if (errPct <= 0.05) return '<b>В точку!</b> Вы чувствуете рынок Инты.';
    var dir = guess > real ? 'вы завысили' : 'вы занизили';
    if (errPct <= 0.20) return 'Почти! ' + dir + ' цену совсем немного.';
    return 'Мимо: ' + dir + ' цену на ' + Math.round(errPct * 100) + '%.';
  }

  function submitGuess() {
    if (answered) return;
    answered = true;

    var lot = deck[round];
    var guess = +slider.value;
    var real = lot.price;
    var pts = pointsFor(guess, real);
    var diff = guess - real;
    var errPct = Math.abs(diff) / real;

    results.push({ guess: guess, real: real, points: pts });
    setProgress();

    // Раскомментируйте для отладки подсчёта: console.log(round, guess, real, diff, pts);

    var ptsEl = $('roundPoints');
    ptsEl.textContent = '+' + pts + ' ' + plural(pts, 'балл', 'балла', 'баллов');
    ptsEl.classList.toggle('result__points--big', pts >= 8);

    $('resGuess').textContent = fmt(guess);
    $('resReal').textContent = fmt(real);

    var diffEl = $('resDiff');
    if (diff === 0) {
      diffEl.textContent = '0 ₽ — идеально!';
      diffEl.style.color = 'var(--good)';
    } else if (diff > 0) {
      diffEl.textContent = '+' + fmtShort(diff) + ' ₽ (вы завысили на ' + Math.round(errPct * 100) + '%)';
      diffEl.style.color = 'var(--bad)';
    } else {
      diffEl.textContent = '−' + fmtShort(-diff) + ' ₽ (вы занизили на ' + Math.round(errPct * 100) + '%)';
      diffEl.style.color = 'var(--blue-mid)';
    }

    $('resComment').innerHTML = commentFor(errPct, guess, real);
    $('resLink').href = lot.url;

    $('btnNext').textContent = (round + 1 < ROUNDS)
      ? 'Следующая квартира'
      : 'К итоговому результату';

    $('guessBlock').classList.add('screen--hidden');
    $('resultBlock').classList.remove('screen--hidden');
    window.scrollTo(0, 0);
  }

  function nextRound() {
    round++;
    if (round < ROUNDS) {
      showRound();
    } else {
      showFinal();
    }
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- Итоги ----------
  function verdictFor(results) {
    var sumGuess = 0, sumReal = 0, total = 0;
    results.forEach(function (r) {
      sumGuess += r.guess;
      sumReal += r.real;
      total += r.points;
    });
    var bias = (sumGuess - sumReal) / sumReal; // <0 — занижал, >0 — завышал

    if (bias <= -0.10) {
      return {
        emoji: '🧐',
        title: 'Жадный студент',
        text: 'Вы стабильно называли цены заметно ниже реальных. Да, квартиры в Инте стоят копейки по московским меркам — но даже здесь есть свой ценник. Ваша суперсила — торг.',
        sub: 'Средняя ваша оценка была ниже реальных цен на ' + Math.round(-bias * 100) + '%.'
      };
    }
    if (bias >= 0.10) {
      return {
        emoji: '💸',
        title: 'Транжира',
        text: 'Вы переоценивали квартиры снова и снова. За такие деньги в Инте можно купить не одну квартиру, а полдома. Питерская ипотека где-то плачет.',
        sub: 'Средняя ваша оценка была выше реальных цен на ' + Math.round(bias * 100) + '%.'
      };
    }
    return {
      emoji: '🏠',
      title: 'Адекватный квартирант',
      text: 'Ваши оценки почти совпали с реальными ценами объявлений. Вы отлично чувствуете рынок недвижимости Республики Коми — риелторы бы вами гордились.',
      sub: 'Среднее отклонение ваших оценок от реальных цен — в пределах 10%.'
    };
  }

  function scoreWord(total) {
    if (total >= 75) return 'Это уровень профессионального оценщика — почти неслыханно!';
    if (total >= 50) return 'Неплохой результат: вы в целом понимаете, сколько стоит квадратный метр в Коми.';
    if (total >= 30) return 'Есть куда расти: присмотритесь к цене за м² в описаниях раундов.';
    return 'Республика Коми вас сегодня удивила — попробуйте ещё раз!';
  }

  function showFinal() {
    var total = 0;
    results.forEach(function (r) { total += r.points; });
    var v = verdictFor(results);

    $('finalEmoji').textContent = v.emoji;
    $('finalVerdict').textContent = v.title;
    $('finalScore').textContent = total;
    $('finalText').textContent = v.text;
    $('finalSub').textContent = v.sub + ' ' + scoreWord(total);

    var table = $('finalTable');
    table.innerHTML = '';
    results.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'final__row';
      var cls = r.points >= 8 ? 'p--high' : (r.points >= 4 ? 'p--mid' : 'p--low');
      row.innerHTML =
        '<span class="n">' + (i + 1) + '</span>' +
        '<span class="g">' + fmtShort(r.guess) + ' ₽</span>' +
        '<span class="r">' + fmtShort(r.real) + ' ₽</span>' +
        '<span class="p ' + cls + '">+' + r.points + '</span>';
      table.appendChild(row);
    });

    setProgress();
    showScreen('screen-final');
  }

  // ---------- События ----------
  $('btnStart').addEventListener('click', startGame);
  $('btnSubmit').addEventListener('click', submitGuess);
  $('btnNext').addEventListener('click', nextRound);
  $('btnRestart').addEventListener('click', startGame);

  // Инициализация
  setProgress();
  paintSlider();
})();
