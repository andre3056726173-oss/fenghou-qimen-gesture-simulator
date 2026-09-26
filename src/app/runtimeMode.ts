// 真实手势模式默认开启；?demo=1 仍可进入上一轮的纯阵局演示。
export const DEMO_MODE = false;
export const SPELL_DEMO_MODE = false;
export const REAL_QA_MODE = false;

/** Modes selected by URL parameters; see README “Demo & Debug”. */
export function readRuntimeMode(location: Location = window.location) {
  const params = new URLSearchParams(location.search);
  const showcase = params.get('showcase') === '1';
  const spellDemo = SPELL_DEMO_MODE || params.get('spellDemo') === '1';
  const kunQa = params.get('qa') === 'kun';
  const kanQa = params.get('qa') === 'kan';
  return {
    showcase,
    showcaseCameraBackground: showcase && params.get('background') === 'camera',
    spellDemo,
    presentationDemo: spellDemo || showcase,
    formationDemo: params.get('demo') === '1' || location.pathname === '/demo',
    realQa: REAL_QA_MODE || params.get('qa') === '1' || kunQa || kanQa,
    kunQa,
    kanQa,
    cameraDebug: params.get('cameraDebug') === '1',
  };
}
