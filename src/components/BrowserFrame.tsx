const symbols = [
  ['open', 'M8 22V7h23v21H8m10-6q10-16 22-4m-9-5 9 5-2-10'],
  ['back', 'M13 18h26M20 9l-12 9 12 9'],
  ['forward', 'M8 18h26M27 9l12 9-12 9'],
  ['refresh', 'M34 11a14 12 0 1 0 3 13M34 4v10H23'],
  ['stop', 'M14 5h19l10 12-10 13H14L5 17Zm3 7 13 13m0-13L17 25'],
  ['home', 'M5 17 24 2l19 15M12 14v21h9V23h8v12h9V14'],
  ['mail', 'M5 7h38v26H5Zm0 0 19 16L43 7'],
];

export function BrowserFrame() {
  return <div className="browser-frame" aria-hidden="true">
    <div className="browser-menubar">File&nbsp;&nbsp; Edit&nbsp;&nbsp; View&nbsp;&nbsp; Go&nbsp;&nbsp; Bookmarks&nbsp;&nbsp; Internet&nbsp;&nbsp; Applications<span>Help</span></div>
    <div className="browser-title">web access: decision.ilyamedve.dev<span className="window-controls">▣ ▰</span></div>
    <div className="browser-toolbar">{symbols.map(([name, path]) => <div className="browser-tool" key={name}><svg viewBox="0 0 48 40"><path d={path}/></svg><span>{name}</span></div>)}<div className="browser-spacer"/><span className="browser-network">⌁&nbsp; ◈&nbsp; ☏&nbsp; ⌂</span><div className="browser-globe">e</div></div>
    <div className="browser-address"><span>Location:</span><div>https://decision.ilyamedve.dev</div></div>
  </div>;
}
