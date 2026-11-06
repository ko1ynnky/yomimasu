// AI に入れる画面の「チャットでの流れの例」の図。図の組み方と決まりは site/install.ts の flowHtml と docs/ui-guide.md の8節「流れの図」にある。
// 問いはどれも「yomimasu」の語を含まず、AI が問いとスキルの説明を照らして自分でスキルを読み込んだ。
// 聞いた環境：Claude Code 2.1.317、モデル claude-opus-5-5。空のフォルダーにスキルだけを写し、利用者の設定と CLAUDE.md を読ませずに聞いた。
// コーディングエージェントの2問（timer、oyama）は、作る前に計画だけを立てる plan モードで頼み、計画までを見た。
//
// 答えは実際の答えからそのまま抜き、省いた所は「…」にする。言い換えも、つなぎの語の足しもしない。
// steps は AI が行った道具の呼び出しを言い換えた行で、各社の画面の文字ではない。フォルダーの中を見る呼び出しは省いた。
// 入れないもの（docs/decisions.md の 2026-11-06 の「流れの図」の項目）：
// - ほかの人の録音を使う案と、ほかの人にも受けてもらうモード。例は自分の読みの練習に限る（ガイド8節）。
// - タイマーの答えの「非公開の URL で公開します」。聞いた環境に Artifact の道具があったための案で、利用者の環境では出ない。
// - 資料の説明を、原文のように引用符で囲んだ所。スキルの文の言い換えで、原文と照らせない。
// - スキルの文で確かめられない出典の付け方（大山札を一定の速さで読む、の講習資料 s.10）。
// - Wikipedia から来た発音の説明（国際音声記号、子音の作り方）。一般の音声学の資料は、余韻で伸ばす最後の音にだけ使う（REVIEW.md の「資料の範囲」）。
//   出どころを分けて答えたことは、見出しを残して示す。
// - 試したあとで変わったスキルの決まりを、理由に挙げた所。大山札の答えの「スキルの決まりで、測定のコードはその場で書かない」は、
//   #66 で SKILL.md が WAV を測るスクリプトを動かす決まりに替わったので、今の決まりのように読める形で出さない。

export type Flow = {
  question: string;
  // スキルを読み込んだあとに行ったこと。先頭の「スキルを読み込みました yomimasu」は図を組むときに足す。
  steps: readonly string[];
  answer: string;
  lang?: string;
  asked: number;
  answered: number;
};

export const FLOW_CHECKED_ON = '2026-11-04';

// 英語の答えの中の日本語は、読み上げが日本語の声で読むよう lang="ja" で包む。
const ja = (text: string) => `<span lang="ja">${text}</span>`;
const read = (...files: string[]) => `ファイルを読みました ${files.map((file) => `<code>${file}</code>`).join('、')}`;
const PLANNED = '計画を書きました（コードはまだ書いていない）';

export const FLOWS: Record<string, Flow> = {
  // 図1。3回とも「最後の字を含めて数える」と答えた。図は2回目の答え。
  yoin: {
    question: '競技かるたの読みで、余韻の3秒はどこから数える？',
    steps: [read('references/README.md'), read('references/timing.md')],
    answer:
      '<p><b>下の句の最後の字（音）から数えます。</b> 最後の字も余韻の3秒に含まれます。</p>' +
      '<ul>' +
      '<li>余韻は、下の句の最後の音を伸ばしていく部分です。テキストの図では、例の下の句の最後の字「つ」の所から余韻の3.0秒が始まっています（完全版 p.3）。講習資料も、最後の字を含めて数えると説明しています（講習資料 s.8）。</li>' +
      '<li>…</li>' +
      '<li>余韻の3秒が終わってから次の上の句を読み始めるまでが、間合いの1.0秒です（完全版 p.3）。</li>' +
      '</ul>' +
      '<p>数え方の例として、講習資料は次の方法を紹介しています。秒針のある時計で1秒の感覚を覚え、最後の字から指先で3回刻んで余韻を3秒にします。…</p>' +
      '<p>出典は全日本かるた協会の読手テキスト（完全版）と講習資料です。ただし、ここでの説明は協会の公式の見解ではありません。</p>',
    asked: 3,
    answered: 3,
  },
  // 図2。表の4つの長さは3回とも同じだった。図は3回目の答え。
  youten: {
    question: '読みを頼まれた日の前に、5-3-1-6 の要点を教えてほしい',
    steps: [read('references/README.md'), read('references/timing.md')],
    answer:
      '<p>5・3・1・6 の要点です。出典はスキルに入っている資料で、どれも協会の見解として書いたものではありません。</p>' +
      '<p><b>1組の流れと標準の長さ</b></p>' +
      '<table><thead><tr><th>順</th><th>部分</th><th>標準</th></tr></thead><tbody>' +
      '<tr><td>1</td><td>前の札の<b>下の句</b></td><td>5秒程度（余韻に入る前まで）</td></tr>' +
      '<tr><td>2</td><td><b>余韻</b></td><td>3.0秒</td></tr>' +
      '<tr><td>3</td><td><b>間合い</b></td><td>1.0秒</td></tr>' +
      '<tr><td>4</td><td>次の札の<b>上の句</b></td><td>6秒程度</td></tr>' +
      '</tbody></table>' +
      '<p>（完全版 p.3、p.26）</p>' +
      '<ul>' +
      '<li><b>いちばん大事なのは、余韻と間合いを毎回同じ長さにすること</b>です。競技者はこの2つでタイミングを合わせます。公認読手の審査でも重く見られる項目です（講習資料 s.9、s.15-16）。</li>' +
      '<li>…</li>' +
      '</ul>' +
      '<p><b>本番までの練習</b></p>' +
      '<ul>' +
      '<li>秒針のある時計で1秒の感覚を覚えます。指で3回刻めば余韻、もう1回で間合いで、合わせて4秒です。慣れると頭の中で数えられるようになり、やがて数えなくてもよくなります（講習資料 s.23）。</li>' +
      '<li>…</li>' +
      '</ul>' +
      '<p>伸ばす位置や初句の速さについても、必要であれば説明できます。</p>',
    asked: 3,
    answered: 3,
  },
  // 図4。3回とも、スキルから来た内容と Wikipedia から来た内容を分けて英語で答えた。図は1回目の答え。
  // 「競技かるたの読みで」のない文では、3回中2回スキルを読み込まなかった（docs/decisions.md）。
  hatsuon: {
    question: '日本語を母語としない自分のために、Wikipedia などの音声学の資料も読ませて、競技かるたの読みで間違えやすい発音を英語で教えてほしい',
    steps: [
      read('references/README.md'),
      read('references/voice.md'),
      read('references/kana-reading.md'),
      read('references/avoid-misreading.md'),
      read('references/card-rules.md'),
      'Web のページを読みました Wikipedia（英語）「Japanese phonology」',
    ],
    lang: 'en',
    answer:
      "<p>A note before the list: the karuta knowledge here comes from this repo's yomimasu skill. … The skill is <b>not endorsed by the association</b>, so nothing below is the association's official view. … The Wikipedia material is general Japanese phonetics and is not karuta guidance. I've labelled where each point comes from.</p>" +
      '<p>…</p>' +
      '<p><b>2. A weak first consonant turns one card into another</b></p>' +
      `<p>If the first consonant doesn't come through and players hear only the vowel, they hear a different card ${ja('(完全版 p.27)')}:</p>` +
      '<table><thead><tr><th>Read</th><th>Can be heard as</th></tr></thead><tbody>' +
      `<tr><td>${ja('たき (55)')}</td><td>${ja('あきの (1)')}</td></tr>` +
      '<tr><td colspan="2">…</td></tr>' +
      `<tr><td>${ja('ほ (81)')}</td><td>${ja('おと (72)')}</td></tr>` +
      '</tbody></table>' +
      `<p><b>The fix is clarity, not loudness.</b> When ${ja('ほ')} sounds like ${ja('お')}, don't push ${ja('ほ')} harder; articulate it cleanly ${ja('(講習資料 s.21)')}. …</p>` +
      '<p><b>General phonetics (Wikipedia), useful if your native language is English:</b></p>' +
      '<p>…</p>',
    asked: 3,
    answered: 3,
  },
  // 図5。2回とも、自分の読みを点検するテストとして計画し、切る位置は手で決める形にした。図は2回目の答え。
  // 「プログラムを作って」の文では、2回ともスキルの測定の決まりに従って「今は作れない」と答えた（docs/decisions.md）。
  oyama: {
    question: '自分の読みで、大山札が決まり字の前に聞き分けられるか、聞き取りテストを作って確かめたい',
    steps: [
      read('references/README.md'),
      read('references/practice.md'),
      'スキルの知識を「大山」で探しました',
      `ファイルの一部を読みました <code>references/card-rules.md</code>、<code>references/avoid-misreading.md</code>`,
      `ファイルの冒頭を読みました <code>assets/cards.json</code>、<code>scripts/measure.ts</code>、<code>scripts/cards.ts</code>`,
      PLANNED,
    ],
    answer:
      '<p>聞き取りテストの計画を書きました。まだ何も作っていません。</p>' +
      '<p><b>よい結果は「聞き分けられない」ことです。</b> 大山札は組ごとに最初の5字が同じで、6字目で決まります。</p>' +
      '<ul>' +
      '<li>31と64：「あさぼらけ」の次が「あ」と「う」</li>' +
      '<li>11と76：「わたのはら」の次が「や」と「こ」</li>' +
      '<li>15と50：「きみがため」の次が「は」と「を」</li>' +
      '</ul>' +
      '<p>決まり字の前に当てられるなら、速さか高さが札ごとに違っていて、手がかりが漏れていることになります。…</p>' +
      '<p><b>作るもの（1ページのHTML、録音はブラウザの外に出しません）</b></p>' +
      '<ol>' +
      '<li>6首の録音を入れます。ページ上で録音することもできます。</li>' +
      '<li>切る位置は、波形を見ながらご自分で5字目の終わりに印を置きます。自動では見つけません。…</li>' +
      '<li>切った音声をランダムな順で約30問流し、組の2首のどちらかを答えます。答え合わせは最後にまとめて出します。</li>' +
      '<li>結果として、組ごとと全体の正答率、50%と比べたp値、CSVを出します。</li>' +
      '</ol>' +
      '<p>…</p>' +
      '<p><b>決めていただきたいこと</b></p>' +
      '<ul>' +
      '<li>目的は上のとおり「漏れていないことを確かめる」でよいですか。</li>' +
      '<li>…</li>' +
      '</ul>',
    asked: 2,
    answered: 2,
  },
  // 図3。2回とも、作る前に使う場所や鳴らし方を尋ねた。図は1回目の答え。最後まで作らせてはいない。
  timer: {
    question: '5-3-1-6 の区切りで鳴る、自分の練習用のタイマーを作りたい',
    steps: [read('references/README.md'), read('references/timing.md'), read('references/practice.md'), PLANNED],
    answer:
      '<p>タイマーの計画を書きました。まだ何も作っていません。始める前に、下の3点を教えてください。</p>' +
      '<p><b>時間配分の根拠</b>（スキルの <code>timing.md</code> より）</p>' +
      '<ul>' +
      '<li>…</li>' +
      '<li>下の句と上の句は「程度」と幅のある言い方なので、秒数を変えられるようにします（完全版 p.26）。</li>' +
      '<li>余韻と間合いは毎回同じ長さに保つものとされています（講習資料 s.9, s.23）。そのため、この2つは既定値どおり正確に鳴ることを優先します。</li>' +
      '<li>なお、このスキルは全日本かるた協会の公認を受けていません。</li>' +
      '</ul>' +
      '<p><b>作るもの</b></p>' +
      '<ul>' +
      '<li>…</li>' +
      '<li>区切りごとに違う高さの音で鳴らします。上の句の開始は高い音で、読み始めの合図にします。</li>' +
      '<li>…余韻と間合いの4.0秒だけをくり返す練習モードを付けます。</li>' +
      '</ul>' +
      '<p><b>確認したいこと</b></p>' +
      '<ol>' +
      '<li><b>使う場所</b>：スマホとPCのどちらで使いますか？ …</li>' +
      '<li><b>鳴らす時点</b>：区切りごとに毎回鳴らしますか？ それとも余韻と間合いの区切りだけでよいですか？</li>' +
      '<li>…</li>' +
      '</ol>',
    asked: 2,
    answered: 2,
  },
};
