// 100首の一覧の並べ方を切り替える。3つの並びは組み立てのときに HTML に入っているので、ここでは見せる並びを選ぶだけにする。
// JS がないときは切り替えのボタンが隠れたまま、決まり字順（多い→少ない）の並びが読める。
export function mountKarutaList(element: HTMLElement) {
  const controls = element.querySelector<HTMLElement>('[data-controls]')!;
  const dirGroup = element.querySelector<HTMLElement>('[data-dirs]')!;
  const orderButtons = [...element.querySelectorAll<HTMLButtonElement>('[data-order]')];
  const dirButtons = [...element.querySelectorAll<HTMLButtonElement>('[data-dir]')];
  const views = [...element.querySelectorAll<HTMLElement>('[data-view]')];
  let order = 'kimariji';
  let dir = 'desc';

  const show = () => {
    for (const b of orderButtons) b.setAttribute('aria-pressed', String(b.dataset.order === order));
    for (const b of dirButtons) b.setAttribute('aria-pressed', String(b.dataset.dir === dir));
    dirGroup.hidden = order !== 'kimariji';
    const visible = order === 'number' ? 'number' : dir;
    for (const v of views) v.hidden = v.dataset.view !== visible;
  };
  const onOrder = (event: Event) => {
    order = (event.currentTarget as HTMLButtonElement).dataset.order!;
    show();
  };
  const onDir = (event: Event) => {
    dir = (event.currentTarget as HTMLButtonElement).dataset.dir!;
    show();
  };

  for (const b of orderButtons) b.addEventListener('click', onOrder);
  for (const b of dirButtons) b.addEventListener('click', onDir);
  controls.hidden = false;
  show();
  return () => {
    for (const b of orderButtons) b.removeEventListener('click', onOrder);
    for (const b of dirButtons) b.removeEventListener('click', onDir);
  };
}
