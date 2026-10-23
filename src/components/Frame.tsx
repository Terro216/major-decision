export const stageOutline = 'M405 182H1572V870H432Q445 851 442 830C442 791 410 765 364 749V561Q364 528 331 526V424C399 414 444 360 444 295C444 255 430 214 405 182Z';

function IconDrawing({ kind }: { kind: 'hand' | 'orbit' | 'blocks' | 'columns' }) {
  return <g stroke="#0b326c" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
    {kind === 'hand' && <g transform="rotate(-9)">
      <path d="M-24-39C-43-40-42-18-26-13L-8 13L5 3L-16-21C-6-36-19-47-28-43L-21-32L-28-24L-36-32" fill="url(#icon-metal)"/>
      <path d="M-15 22L-6-1Q-3-10 3-6L9-1L17-11Q21-16 25-11L25-3Q34-12 37-5L35 5Q43 0 44 8L37 23L21 38L-8 33Z" fill="url(#icon-metal)"/>
      <path d="M-8 29L18 44L7 53L-22 34Z" fill="#aed5e7"/>
      <path d="M4 4L-2 15M15 0L7 14M26 4L18 18M35 9L28 22M-20-34L-16-29" stroke="#e3f6ff" strokeWidth="3"/>
      <path d="M-13 27L3 37M-25-14L-15-5M-33-20L-27-18" stroke="#548bb9" strokeWidth="2"/>
    </g>}
    {kind === 'orbit' && <g transform="rotate(-22)">
      <path d="M0-43C-38-46-46-14-36 15C-22 51 16 47 36 18L25 9C13 39-13 38-25 15C-39-13-23-39 0-32Z" fill="url(#icon-metal)"/>
      <path d="M8-34C-19-42-33-14-23 12C-12 40 18 33 28 8C36-13 23-29 8-34Z" fill="#5686ba"/>
      <path d="M6-28C-15-34-25-11-17 10C-7 31 16 25 22 7C26-8 18-23 6-28Z" fill="#183b76" stroke="#d0e9f8"/>
      <ellipse cx="3" cy="-1" rx="12" ry="21" fill="#619fc8" stroke="#afd5ea"/>
      <ellipse cx="5" cy="1" rx="6" ry="12" fill="#173165"/>
      <path d="M-5-44L15-40L20-31M29-22L38-9L30 1M22 28L9 39L-5 37M-34 14L-37 0" fill="none" stroke="#daeef9"/>
    </g>}
    {kind === 'blocks' && <g>
      <path d="M-31-27L-14-34L-7-28L7-38L28-30L29-14L40-5L30 7L36 23L15 32L3 43L-11 31L-32 32L-39 8L-32-7Z" fill="#b3d8e6"/>
      <path d="M-27-24H-12V0H-29ZM-5-29H10V-4H-5ZM15-24H31V-5H15ZM-32 6H-12V25H-32ZM-5 4H16V27H-5ZM22 4H35V23H22Z" fill="#16416d"/>
      <path d="M-24-22V-3M-18-21V-3M0-25V-7M18-19Q31-22 26-10H19ZM-28 12H-23V18H-28ZM-18 12V18M1 8V22Q13 25 12 13L7 9ZM25 8V18" fill="none" stroke="#d7e9ec" strokeWidth="3"/>
      <path d="M-35-8L-40 0M-5-37L3-41M-10 34L-4 39M36-10L42-6" fill="none" stroke="#284d80"/>
    </g>}
    {kind === 'columns' && <g>
      <path d="M-32-34L-19-29L-16-13L-20-3L-14 9L-15 27L-34 27L-40 18L-33 11L-28 11L-29 2L-37 0L-39-13L-29-13L-27-18L-35-23Z" fill="#75a5c5"/>
      <path d="M-9-34L3-31V23L9 28L5 34L-13 31L-15 22L-10 15Z" fill="url(#icon-metal)"/>
      <path d="M6-31H38V-20H7ZM11-7H38V5H11ZM13 21H38V32H13Z" fill="#8bb9d1"/>
      <path d="M9-31H36M11-7H37M16 21H38M-9-28V20M-33-30L-25-24M-35-9L-28-5" fill="none" stroke="#def0f7" strokeWidth="2.4"/>
      <path d="M-35 44H36" stroke="#092a62" strokeWidth="9"/>
      {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={-33 + i * 9.5} cy="43" r="2.2" fill="#def0f5" stroke="none"/>)}
    </g>}
  </g>;
}

function SmallIcon({ kind, x, y, radius }: { kind: 'hand' | 'orbit' | 'blocks' | 'columns'; x: number; y: number; radius: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle cy="-3" r={radius + 10} fill="#071e53"/>
    <circle r={radius + 4} fill="url(#icon-bezel)"/>
    <circle r={radius - 7} fill={kind === 'blocks' ? '#3b9ac5' : 'url(#icon-face)'} stroke="#214880" strokeWidth="4"/>
    <path d={`M${-radius * .88},${radius * .18} Q${-radius * .86},${radius * .72} ${-radius * .27},${radius * .91}`} fill="none" stroke="#65cbe6" strokeWidth="5"/>
    <path d={`M${-radius * .82},${radius * .44} Q${-radius * .7},${radius * .72} ${-radius * .43},${radius * .78}`} fill="none" stroke="#d0faff" strokeWidth="2.5"/>
    <g transform="scale(.78)"><IconDrawing kind={kind}/></g>
  </g>;
}

export function Frame() {
  return <svg className="frame-art" viewBox="0 0 1600 980" aria-hidden="true">
    <defs>
      <linearGradient id="body-blue" x2=".9" y2="1"><stop stopColor="#16469c"/><stop offset=".4" stopColor="#123a8a"/><stop offset="1" stopColor="#112d74"/></linearGradient>
      <radialGradient id="body-light" cx=".04" cy=".55" r=".8"><stop stopColor="#204fa3" stopOpacity=".7"/><stop offset="1" stopColor="#0c205f" stopOpacity="0"/></radialGradient>
      <linearGradient id="body-edge-shadow" x1="0" y1="0" x2=".10" y2="0"><stop stopColor="#020b28" stopOpacity=".42"/><stop offset="1" stopColor="#020b28" stopOpacity="0"/></linearGradient>
      <linearGradient id="body-shadow-y" x1="0" y1="0" x2="0" y2="1"><stop offset=".18" stopColor="black"/><stop offset=".34" stopColor="white"/></linearGradient>
      <mask id="body-shadow-mask"><rect width="1600" height="980" fill="url(#body-shadow-y)"/></mask>
      <linearGradient id="edge-blue" x1="1" y1="0" x2="0" y2="1"><stop stopColor="#071331"/><stop offset=".65" stopColor="#15336f"/><stop offset=".91" stopColor="#3376bd"/><stop offset=".98" stopColor="#8ce6f4"/><stop offset="1" stopColor="#234e91"/></linearGradient>
      <linearGradient id="stage-trim" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#daf4ff"/><stop offset=".4" stopColor="#c0cde5"/><stop offset="1" stopColor="#9eb5d4"/></linearGradient>
      <linearGradient id="icon-bezel" x1=".75" y1="0" x2=".15" y2="1"><stop stopColor="#091d4f"/><stop offset=".48" stopColor="#12347d"/><stop offset=".78" stopColor="#316aa9"/><stop offset=".94" stopColor="#80d8e9"/><stop offset="1" stopColor="#214c8b"/></linearGradient>
      <radialGradient id="icon-face" cx=".7" cy=".3" r=".8"><stop stopColor="#387fc8"/><stop offset=".7" stopColor="#2869b6"/><stop offset="1" stopColor="#174587"/></radialGradient>
      <linearGradient id="icon-metal" x2=".8" y2="1"><stop stopColor="#dbedf6"/><stop offset=".42" stopColor="#77aed3"/><stop offset=".7" stopColor="#b6dce9"/><stop offset="1" stopColor="#547ca9"/></linearGradient>
      <radialGradient id="badge-blue" cx=".25" cy=".35" r=".85"><stop stopColor="#317fc4"/><stop offset=".5" stopColor="#234f9d"/><stop offset="1" stopColor="#0b235b"/></radialGradient>
      <linearGradient id="edge-glint" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#dbffff"/><stop offset=".35" stopColor="#64ccea"/><stop offset="1" stopColor="#286bb7" stopOpacity="0"/></linearGradient>
      <filter id="cast-edge" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
    </defs>
    <rect x="4" y="4" width="1592" height="972" rx="16" fill="url(#body-blue)" stroke="#061731" strokeWidth="8"/>
    <rect x="12" y="12" width="1576" height="960" fill="url(#body-light)"/>
    <rect x="12" y="12" width="1576" height="960" fill="url(#body-edge-shadow)" mask="url(#body-shadow-mask)"/>
    <path d="M10 15H1574Q1592 10 1592 29V958" fill="none" stroke="#3166b2" strokeWidth="5"/>
    <path d="M1585 13l-9 8" stroke="#c6f8ff" strokeWidth="3"/>
    <rect x="402" y="10" width="1181" height="151" rx="17" fill="#030b0b" stroke="#0c2053" strokeWidth="16"/>
    <rect x="402" y="10" width="1181" height="151" rx="17" fill="none" stroke="url(#edge-blue)" strokeWidth="7"/>
    <path d="M401 135q0 24 23 24h150" fill="none" stroke="url(#edge-glint)" strokeWidth="4"/>
    <path d={stageOutline} fill="#070f3e" stroke="#0a2058" strokeWidth="19"/>
    <path d={stageOutline} fill="none" stroke="#285a9a" strokeWidth="8"/>
    <path d={stageOutline} fill="none" stroke="url(#stage-trim)" strokeWidth="4"/>
    <path d="M405 183C440 236 448 267 444 306M364 523q38 2 38 49M365 747q84 28 80 99" fill="none" stroke="url(#edge-glint)" strokeWidth="10"/>
    <path d="M406 183q25 38 31 64M365 525q23 0 29 18M366 749q29 9 46 24" fill="none" stroke="#cef9ff" strokeWidth="4.1"/>
    <SmallIcon kind="hand" x={195} y={107} radius={54}/>
    <SmallIcon kind="orbit" x={316} y={71} radius={56}/>
    <SmallIcon kind="blocks" x={126} y={219} radius={52}/>
    <SmallIcon kind="columns" x={122} y={344} radius={52}/>
    <g transform="translate(8 -14)">
    <circle cx="302" cy="289" r="132" fill="#061942" filter="url(#cast-edge)"/>
    <circle cx="302" cy="294" r="128" fill="url(#icon-bezel)"/>
    <circle cx="302" cy="294" r="116" fill="url(#badge-blue)" stroke="#22568d" strokeWidth="3"/>
    <path d="M189 324q18 77 98 88" fill="none" stroke="#53bad7" strokeWidth="6"/>
    <path d="M194 342q18 46 58 62" fill="none" stroke="#bdf6f5" strokeWidth="2.5"/>
    </g>
    <ellipse cx="233" cy="843" rx="198" ry="105" fill="#020607" stroke="#112a68" strokeWidth="18"/>
    <path d="M37 830q-3 48 42 78M356 759q92 31 77 103" fill="none" stroke="#449aca" strokeWidth="8"/>
    <path d="M42 853q6 29 27 43M357 756q72 22 80 66" fill="none" stroke="#b2f5fa" strokeWidth="3"/>
    <path d="M421 902H1488q18 0 19 13" fill="none" stroke="#071a40" strokeWidth="15"/>
    <path d="M421 895H1486q17 0 20 14" fill="none" stroke="#5085b4" strokeWidth="3"/>
    <circle cx="1543" cy="907" r="23" fill="#152047" stroke="#59657c" strokeWidth="3"/>
    <circle cx="1543" cy="907" r="16" fill="#492d58"/>
    <path d="M1532 908h22" stroke="#9a699c" strokeWidth="3"/>
  </svg>;
}

export function AskSymbol() {
  return <svg viewBox="0 0 120 160" aria-hidden="true">
    <defs><linearGradient id="ask-fill" x1=".6" y1="0" x2=".3" y2="1"><stop stopColor="#3bb5ee"/><stop offset=".65" stopColor="#2b9edf"/><stop offset="1" stopColor="#59d4ff"/></linearGradient></defs>
    <path className="ask-glyph" d="M16 49V29Q17 6 59 7Q105 5 109 40Q113 67 75 83L69 102H35L36 78Q38 65 59 57Q75 51 72 39Q70 29 61 30Q51 30 51 43L49 50Z" fill="url(#ask-fill)" stroke="#082658" strokeWidth="10" strokeLinejoin="round"/>
    <circle className="ask-dot" cx="51" cy="129" r="23" fill="url(#ask-fill)" stroke="#082658" strokeWidth="8"/>
    <path d="M17 49l10 9 18-8M30 130q0 15 18 20" fill="none" stroke="#a5ecf4" strokeWidth="4"/>
    <path d="M17 49l9 5M31 138l9 7" stroke="#e5ffff" strokeWidth="3"/>
  </svg>;
}

export function MobileOrnaments() {
  return <svg className="mobile-ornaments" viewBox="0 0 490 140" aria-hidden="true">
    <SmallIcon kind="hand" x={65} y={73} radius={52}/>
    <SmallIcon kind="orbit" x={185} y={62} radius={54}/>
    <SmallIcon kind="blocks" x={305} y={73} radius={52}/>
    <SmallIcon kind="columns" x={425} y={62} radius={52}/>
  </svg>;
}
