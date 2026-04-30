import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Environment } from '@react-three/drei';
import { Video, StopCircle } from 'lucide-react';

// --- Configuration ---
const GRID_COLS = 32; // Increased resolution slightly for better video feed
const GRID_ROWS = 24; // 4:3 Aspect ratio approx
const SPACING = 0.8; // Tighter spacing
const SIZE = 0.35;   // Smaller size
const THICKNESS = 0.15; 

const KineticGrid: React.FC = () => {
  const meshFrontRef = useRef<THREE.InstancedMesh>(null);
  const meshBackRef = useRef<THREE.InstancedMesh>(null);
  const { viewport, mouse } = useThree();

  // Video and Canvas refs for processing
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Initialize Webcam
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Configure canvas for low-res pixel extraction
    canvas.width = GRID_COLS;
    canvas.height = GRID_ROWS;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    contextRef.current = ctx;

    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            } 
        });
        video.srcObject = stream;
        await video.play();
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    };

    startWebcam();

    return () => {
      if (video.srcObject) {
        const tracks = (video.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  // Create a dummy object for matrix calculations
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Precompute positions
  const { count, positions } = useMemo(() => {
    const count = GRID_COLS * GRID_ROWS;
    const positions: [number, number, number][] = [];

    const width = (GRID_COLS - 1) * SPACING;
    const height = (GRID_ROWS - 1) * SPACING;

    for (let i = 0; i < GRID_COLS; i++) {
      for (let j = 0; j < GRID_ROWS; j++) {
        // Calculate x,y centered
        const x = (i * SPACING) - (width / 2);
        const y = (j * SPACING) - (height / 2);
        positions.push([x, y, 0]);
      }
    }
    return { count, positions };
  }, []);

  // Geometries
  const frontGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(SIZE, SIZE, THICKNESS / 2, 32);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, THICKNESS / 4);
    return geo;
  }, []);

  const backGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(SIZE, SIZE, THICKNESS / 2, 32);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -THICKNESS / 4);
    return geo;
  }, []);

  // Initialize instances positions
  useEffect(() => {
    if (meshFrontRef.current && meshBackRef.current) {
      positions.forEach((pos, i) => {
        dummy.position.set(...pos);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        meshFrontRef.current!.setMatrixAt(i, dummy.matrix);
        meshBackRef.current!.setMatrixAt(i, dummy.matrix);
        // Set default color
        meshFrontRef.current!.setColorAt(i, new THREE.Color('#333'));
      });
      meshFrontRef.current.instanceMatrix.needsUpdate = true;
      meshBackRef.current.instanceMatrix.needsUpdate = true;
      meshFrontRef.current.instanceColor!.needsUpdate = true;
    }
  }, [count, positions, dummy]);

  // Animation Loop
  useFrame((state) => {
    if (!meshFrontRef.current || !meshBackRef.current) return;

    // --- 1. Video Color Sampling ---
    const video = videoRef.current;
    const ctx = contextRef.current;
    
    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        // Draw video to small canvas to downsample
        // We scale x by -1 to create a mirror effect
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -GRID_COLS, 0, GRID_COLS, GRID_ROWS);
        ctx.restore();

        // Get pixel data
        const frame = ctx.getImageData(0, 0, GRID_COLS, GRID_ROWS);
        const data = frame.data;

        // Apply colors to instances
        for (let i = 0; i < GRID_COLS; i++) {
            for (let j = 0; j < GRID_ROWS; j++) {
                 // Grid generation loop was: outer i (cols/x), inner j (rows/y)
                 // But positions were generated with j=0 being bottom (negative Y)
                 // Canvas data y=0 is top.
                 // So we need to sample canvas at (i, GRID_ROWS - 1 - j)
                 
                 const canvasX = i;
                 const canvasY = (GRID_ROWS - 1) - j;
                 
                 const pixelIndex = (canvasY * GRID_COLS + canvasX) * 4;
                 
                 const r = data[pixelIndex] / 255;
                 const g = data[pixelIndex + 1] / 255;
                 const b = data[pixelIndex + 2] / 255;
                 
                 // Existing index from position generation
                 const instanceIndex = i * GRID_ROWS + j;
                 
                 tempColor.setRGB(r, g, b);
                 
                 // Boost saturation slightly for better look on dark bg
                 // tempColor.offsetHSL(0, 0.1, 0); 
                 
                 meshFrontRef.current.setColorAt(instanceIndex, tempColor);
            }
        }
        meshFrontRef.current.instanceColor!.needsUpdate = true;
    }

    // --- 2. Kinetic Movement ---
    const mouseX = (mouse.x * viewport.width) / 2;
    const mouseY = (mouse.y * viewport.height) / 2;
    const radius = 6;
    
    for (let i = 0; i < count; i++) {
        const [x, y, z] = positions[i];
        
        const dist = Math.sqrt(Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2));
        
        let t = Math.max(0, 1 - dist / radius);
        t = t * t * (3 - 2 * t); 
        
        // Target Rotation: 
        // 0 -> Front face (Video)
        // PI -> Back face (Mirror/Chrome)
        // When mouse is close (t=1), we want to see the "Mirror" (Back face)? 
        // Or do we want to ripple the video? 
        // Let's flip to chrome when interacted with.
        const targetRotation = t * Math.PI;

        const rotX = targetRotation;
        const rotY = targetRotation * 0.2; // Reduced twist for clearer image

        dummy.position.set(x, y, z);
        dummy.rotation.set(rotX, rotY, 0); 
        dummy.updateMatrix();
        
        meshFrontRef.current.setMatrixAt(i, dummy.matrix);
        meshBackRef.current.setMatrixAt(i, dummy.matrix);
    }

    meshFrontRef.current.instanceMatrix.needsUpdate = true;
    meshBackRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* Mesh 1: The Front Face (Video Feed) */}
      <instancedMesh 
        ref={meshFrontRef} 
        args={[undefined, undefined, count]}
        geometry={frontGeometry}
      >
        <meshStandardMaterial 
            roughness={0.4} 
            metalness={0.0} 
        />
      </instancedMesh>

      {/* Mesh 2: The Back Face (Chrome) */}
      <instancedMesh 
        ref={meshBackRef} 
        args={[undefined, undefined, count]}
        geometry={backGeometry}
      >
        <meshStandardMaterial 
            color="#ffffff" 
            roughness={0.0} 
            metalness={1.0} 
            envMapIntensity={1.5}
        />
      </instancedMesh>
    </group>
  );
};

const MagicMirror: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleCanvasCreated = (state: any) => {
    canvasRef.current = state.gl.domElement;
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      // @ts-ignore - captureStream is not in all TS definitions
      const stream = canvas.captureStream(30); // 30 FPS
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
      chunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kinetic-mirror-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Recording failed. Your browser might not support canvas capture.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <>
      <div className="absolute bottom-8 right-8 z-50 flex gap-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`p-4 rounded-full transition-all duration-300 shadow-lg flex items-center justify-center ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse ring-4 ring-red-500/30' 
              : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10'
          }`}
          title={isRecording ? "Stop Recording" : "Record Animation"}
        >
          {isRecording ? <StopCircle size={24} /> : <Video size={24} />}
        </button>
      </div>
      
      <Canvas
        onCreated={handleCanvasCreated}
        camera={{ position: [0, 0, 22], fov: 35 }}
        dpr={[1, 2]} 
        gl={{ 
          antialias: true, 
          toneMapping: THREE.ACESFilmicToneMapping,
          preserveDrawingBuffer: true // Required for canvas capture
        }}
      >
        <color attach="background" args={['#111']} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#fff" />
        <pointLight position={[-10, -10, 5]} intensity={0.5} color="#444" />

        <KineticGrid />

        <Environment preset="studio" /> 
      </Canvas>
    </>
  );
};

export default MagicMirror;