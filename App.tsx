import React from 'react';
import MagicMirror from './components/MagicMirror';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen relative bg-neutral-900">
      <div className="absolute top-0 left-0 z-10 p-6 text-white/80 pointer-events-none mix-blend-difference">
        <h1 className="text-4xl font-bold tracking-tighter mb-2">Kinetic Mirror</h1>
        <p className="text-sm font-light tracking-wide max-w-xs">
          Allow camera access to activate the mirror.
          <br />
          Move your cursor to ripple the reflection.
          <br/>
          <span className="opacity-50 text-xs">Webcam feed is processed locally.</span>
        </p>
      </div>
      <MagicMirror />
    </div>
  );
};

export default App;