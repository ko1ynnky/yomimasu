import type { Segment } from '../pair.ts';
import './band.css';

// 帯は札の読みの表を読まない。総論で帯だけを使う画面に、表を読み込ませないためである。
export function Band({ segments, fixed = false, tall = false }: { segments: readonly Segment[]; fixed?: boolean; tall?: boolean }) {
  const className = ['band', fixed && 'band--static', tall && 'band--tall'].filter(Boolean).join(' ');
  return (
    <div class={className} role="img" aria-label={segments.map((s) => `${s.name} ${s.sec}秒`).join('、')}>
      {segments.map((s) => (
        <div class="seg" data-seg={s.key} style={{ flex: `${s.sec} 1 0` }} aria-hidden="true">
          <i />
          <span>
            {s.name}
            <small>
              {s.sec}
              <span class="unit">秒</span>
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}
