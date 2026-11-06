// スキルの入口。node yomimasu.ts <Web のボタンが打ち込む文字> で動かす。例：node yomimasu.ts 結果を見る ~/reading.wav ほ あはれ
// 音声はこの端末で読み、ネットワークを使わない。
import { readFileSync } from 'node:fs';
import { answer } from './answer.ts';

const reply = answer(process.argv.slice(2),{ readFile: (path) => readFileSync(path) });
(reply.ok ? process.stdout : process.stderr).write(`${reply.text}\n`);
process.exitCode = reply.ok ? 0 : 1;
