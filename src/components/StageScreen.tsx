import wordmark from '../assets/wordmark.svg';
import goldQuestion from '../assets/question-mark.svg';
import { answerLetters, answerPaths } from '../answerPaths';

export type Screen = 'idle' | 'yes' | 'no';

export function StageScreen({ screen }: { screen: Screen }) {
  return <div className="stage-screen" data-screen={screen}>
    {screen === 'idle' ? <div className="splash" role="img" aria-label="Major Decision">
      <svg className="question-pattern" viewBox="0 0 1244 688" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><g id="question-with-dot"><image href={goldQuestion} width="190" height="300"/></g></defs>
        <rect width="1244" height="688" fill="#0b1009"/>
        <g fill="#e8cb56" transform="translate(68 0)">
          <use href="#question-with-dot" transform="translate(-68 -9) scale(1.14)"/>
          <use href="#question-with-dot" transform="translate(188 -19) scale(1.09)"/>
          <use href="#question-with-dot" transform="translate(446 -15) scale(1.12)"/>
          <use href="#question-with-dot" transform="translate(711 -18) scale(1.12)"/>
          <use href="#question-with-dot" transform="translate(979 -19) scale(1.14)"/>
          <use href="#question-with-dot" transform="translate(-51 357) scale(1.17)"/>
          <use href="#question-with-dot" transform="translate(214 356) scale(1.17)"/>
          <use href="#question-with-dot" transform="translate(478 357) scale(1.17)"/>
          <use href="#question-with-dot" transform="translate(742 357) scale(1.17)"/>
          <use href="#question-with-dot" transform="translate(1007 357) scale(1.17)"/>
        </g>
      </svg>
      <div className="splash-medallion"><img src={wordmark} alt="" draggable="false"/></div>
    </div> : <div className={`answer answer--${screen}`}>
      <svg viewBox="0 0 1244 688" className="answer-art" aria-hidden="true">
        <defs>
          <radialGradient id="answer-background" cx=".55" cy=".55" r=".75"><stop stopColor="#2c397f"/><stop offset=".55" stopColor="#141d62"/><stop offset="1" stopColor="#080f3d"/></radialGradient>
          <linearGradient id="yes-front" x1="0" y1="0" x2=".4" y2="1"><stop stopColor="#44bf2b"/><stop offset=".44" stopColor="#62ce39"/><stop offset="1" stopColor="#3da426"/></linearGradient>
          <linearGradient id="no-front" x1="0" y1="0" x2=".45" y2="1"><stop stopColor="#d0321b"/><stop offset=".52" stopColor="#ee492b"/><stop offset="1" stopColor="#ca321e"/></linearGradient>
          <filter id="answer-shadow" x="-20%" y="-30%" width="150%" height="170%"><feGaussianBlur stdDeviation="8"/></filter>
        </defs>
        <rect width="1244" height="688" fill="url(#answer-background)"/>
        <g transform={screen === 'yes' ? 'translate(111 135) scale(3.25)' : 'translate(267 135) scale(3.25)'}>
          {answerLetters[screen].map(({ letter, x }) => <g key={letter} transform={`translate(${x} 0)`}>
            <path d={answerPaths[letter]} transform="translate(3 -2)" fill={screen === 'yes' ? '#22561b' : '#711a14'} fillRule="evenodd" stroke={screen === 'yes' ? '#22561b' : '#711a14'} strokeWidth="2"/>
            <path d={answerPaths[letter]} fill={`url(#${screen}-front)`} fillRule="evenodd" stroke={screen === 'yes' ? '#75c544' : '#e84f36'} strokeWidth=".9"/>
          </g>)}
        </g>
      </svg>
      <span className="visually-hidden">{screen.toUpperCase()}</span>
    </div>}
  </div>;
}
