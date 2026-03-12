import React, { useState, useEffect, useRef } from 'react';
import { Search, Volume2, Play, X, ChevronRight, ChevronLeft, Loader2, Leaf, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Herb } from './types';
import { generateHerbAudio, generateHerbImage } from './services/gemini';

export default function App() {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [herbs, setHerbs] = useState<Herb[]>([]);
  const [selectedHerb, setSelectedHerb] = useState<Herb | null>(null);
  const [isSlideshow, setIsSlideshow] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [herbImage, setHerbImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playPcmAudio = async (base64Data: string) => {
    try {
      initAudioContext();
      const ctx = audioContextRef.current!;
      
      // Convert base64 to ArrayBuffer
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert Int16 PCM to Float32
      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
    } catch (error) {
      console.error("Error playing PCM audio:", error);
    }
  };

  useEffect(() => {
    fetchHerbs();
    // Cleanup audio context on unmount
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (search.length > 1) {
      fetch(`/api/herbs/suggestions?q=${search}`)
        .then(res => res.json())
        .then(setSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [search]);

  const fetchHerbs = async (query = '') => {
    setIsLoading(true);
    const res = await fetch(`/api/herbs?q=${query}`);
    const data = await res.json();
    setHerbs(data);
    setIsLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHerbs(search);
    setSuggestions([]);
  };

  const playHerbInfo = async (herb: Herb) => {
    initAudioContext();
    const text = `${herb.name}. Category: ${herb.category}. Primary uses include ${herb.primary_uses}. Effects and actions: ${herb.effects_actions}. Application methods: ${herb.application_methods}. Pairs well with ${herb.pairs_well_with}.`;
    setIsLoading(true);
    const base64 = await generateHerbAudio(text);
    if (base64) {
      await playPcmAudio(base64);
    }
    setIsLoading(false);
  };

  const startSlideshow = async () => {
    initAudioContext();
    setIsSlideshow(true);
    setSlideshowIndex(0);
    loadSlide(herbs[0]);
  };

  const loadSlide = async (herb: Herb) => {
    setHerbImage(null);
    const img = await generateHerbImage(herb.name);
    setHerbImage(img);
    playHerbInfo(herb);
  };

  const generateVideo = async (herb: Herb, imageUrl: string) => {
    setIsRecording(true);
    try {
      const text = `${herb.name}. Category: ${herb.category}. Primary uses include ${herb.primary_uses}. Effects and actions: ${herb.effects_actions}. Application methods: ${herb.application_methods}. Pairs well with ${herb.pairs_well_with}.`;
      const base64Audio = await generateHerbAudio(text);

      // Load image onto a canvas
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d')!;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Build audio stream from PCM data
      const audioCtx = new AudioContext({ sampleRate: 24000 });
      let audioDuration = 8; // fallback seconds
      let audioSource: AudioBufferSourceNode | null = null;

      if (base64Audio) {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
        const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
        audioBuffer.getChannelData(0).set(float32);
        audioDuration = audioBuffer.duration;
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = audioBuffer;
        const dest = audioCtx.createMediaStreamDestination();
        audioSource.connect(dest);
        audioSource.connect(audioCtx.destination);
        const canvasStream = canvas.captureStream(30);
        dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
        const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
        const chunks: Blob[] = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${herb.name.replace(/\s+/g, '_')}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          audioCtx.close();
          setIsRecording(false);
        };

        recorder.start();
        audioSource.start();

        const startTime = performance.now();
        const duration = audioDuration * 1000;

        const drawFrame = (now: number) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const scale = 1 + progress * 0.4; // zoom from 1x to 1.4x
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(scale, scale);
          ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
          ctx.restore();
          // Herb name overlay
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
          ctx.fillStyle = '#fff';
          ctx.font = 'italic 36px "Cormorant Garamond", serif';
          ctx.fillText(herb.name, 40, canvas.height - 28);
          if (progress < 1) {
            requestAnimationFrame(drawFrame);
          } else {
            recorder.stop();
          }
        };
        requestAnimationFrame(drawFrame);
      } else {
        // No audio — record canvas-only
        const canvasStream = canvas.captureStream(30);
        const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
        const chunks: Blob[] = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${herb.name.replace(/\s+/g, '_')}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          audioCtx.close();
          setIsRecording(false);
        };
        recorder.start();
        const startTime = performance.now();
        const duration = audioDuration * 1000;
        const drawFrame = (now: number) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const scale = 1 + progress * 0.4;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(scale, scale);
          ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
          ctx.restore();
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
          ctx.fillStyle = '#fff';
          ctx.font = 'italic 36px "Cormorant Garamond", serif';
          ctx.fillText(herb.name, 40, canvas.height - 28);
          if (progress < 1) requestAnimationFrame(drawFrame);
          else recorder.stop();
        };
        requestAnimationFrame(drawFrame);
      }
    } catch (err) {
      console.error('Video generation error:', err);
      setIsRecording(false);
    }
  };

  const nextSlide = () => {
    const next = (slideshowIndex + 1) % herbs.length;
    setSlideshowIndex(next);
    loadSlide(herbs[next]);
  };

  const prevSlide = () => {
    const prev = (slideshowIndex - 1 + herbs.length) % herbs.length;
    setSlideshowIndex(prev);
    loadSlide(herbs[prev]);
  };

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto">
      <header className="mb-12 text-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-3 mb-4"
        >
          <Leaf className="text-herb-accent w-8 h-8" />
          <h1 className="serif text-5xl md:text-6xl font-light tracking-tight">Herbal Reference</h1>
        </motion.div>
        <p className="text-herb-accent/70 italic serif text-xl">A curated botanical guide for wellness and healing</p>
      </header>

      <div className="relative max-w-2xl mx-auto mb-12">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for an herb (e.g. Lavender)..."
            className="w-full bg-white border border-herb-accent/20 rounded-full py-4 px-12 focus:outline-none focus:ring-2 focus:ring-herb-accent/30 transition-all serif text-lg"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-herb-accent/50 w-5 h-5" />
          {search && (
            <button 
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-herb-accent/50 hover:text-herb-accent"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </form>

        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-10 w-full mt-2 bg-white rounded-2xl shadow-xl border border-herb-accent/10 overflow-hidden"
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSearch(s);
                    fetchHerbs(s);
                    setSuggestions([]);
                  }}
                  className="w-full text-left px-6 py-3 hover:bg-herb-bg transition-colors serif text-lg border-b border-herb-accent/5 last:border-0"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-center mb-12">
        <button
          onClick={startSlideshow}
          disabled={herbs.length === 0}
          className="flex items-center gap-2 bg-herb-accent text-white px-8 py-3 rounded-full hover:bg-herb-ink transition-all shadow-lg disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          Start Slideshow Mode
        </button>
      </div>

      {isLoading && herbs.length === 0 ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-herb-accent/50" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {herbs.map((herb) => (
            <motion.div
              layoutId={`herb-${herb.id}`}
              key={herb.id}
              onClick={() => setSelectedHerb(herb)}
              className="bg-white p-8 rounded-[32px] shadow-sm hover:shadow-md transition-all cursor-pointer border border-herb-accent/5 group"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs uppercase tracking-widest text-herb-accent/60 font-semibold">{herb.category}</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    playHerbInfo(herb);
                  }}
                  className="p-2 rounded-full hover:bg-herb-bg text-herb-accent transition-colors"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
              <h3 className="serif text-3xl mb-3 group-hover:text-herb-accent transition-colors">{herb.name}</h3>
              <p className="text-herb-ink/70 line-clamp-2 italic serif mb-4">{herb.primary_uses}</p>
              <div className="flex items-center text-herb-accent text-sm font-medium">
                View Details <ChevronRight className="w-4 h-4 ml-1" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedHerb && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-herb-ink/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-3xl rounded-[40px] shadow-2xl overflow-hidden relative"
            >
              <button 
                onClick={() => setSelectedHerb(null)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-herb-bg text-herb-accent z-10"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="p-8 md:p-12">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs uppercase tracking-widest text-herb-accent/60 font-bold">{selectedHerb.category}</span>
                </div>
                <h2 className="serif text-5xl mb-8">{selectedHerb.name}</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <section>
                    <h4 className="text-xs uppercase tracking-widest font-bold text-herb-accent mb-3">Primary Uses</h4>
                    <p className="serif text-xl italic mb-6">{selectedHerb.primary_uses}</p>
                    
                    <h4 className="text-xs uppercase tracking-widest font-bold text-herb-accent mb-3">Effects & Actions</h4>
                    <p className="serif text-xl italic mb-6">{selectedHerb.effects_actions}</p>

                    <h4 className="text-xs uppercase tracking-widest font-bold text-herb-accent mb-3">Pairs Well With</h4>
                    <p className="serif text-xl italic">{selectedHerb.pairs_well_with}</p>
                  </section>
                  
                  <section>
                    <h4 className="text-xs uppercase tracking-widest font-bold text-red-800/60 mb-3">Contraindications</h4>
                    <p className="serif text-xl italic mb-6 text-red-900/80">{selectedHerb.contraindications}</p>
                    
                    <h4 className="text-xs uppercase tracking-widest font-bold text-herb-accent mb-3">Application Methods</h4>
                    <p className="serif text-xl italic mb-6">{selectedHerb.application_methods}</p>

                    <h4 className="text-xs uppercase tracking-widest font-bold text-herb-accent mb-3">Storage</h4>
                    <p className="serif text-xl italic">{selectedHerb.storage}</p>
                  </section>
                </div>

                <div className="mt-12 flex justify-center">
                  <button
                    onClick={() => playHerbInfo(selectedHerb)}
                    className="flex items-center gap-2 bg-herb-bg text-herb-accent px-8 py-3 rounded-full hover:bg-herb-accent hover:text-white transition-all"
                  >
                    <Volume2 className="w-5 h-5" />
                    Read Information Aloud
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Slideshow Mode */}
      <AnimatePresence>
        {isSlideshow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-herb-bg flex flex-col"
          >
            <div className="p-6 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Leaf className="text-herb-accent w-6 h-6" />
                <span className="serif text-2xl">Herb Slideshow</span>
              </div>
              <button 
                onClick={() => {
                  setIsSlideshow(false);
                }}
                className="p-2 rounded-full hover:bg-white text-herb-accent"
              >
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 md:p-12 gap-12">
              <div className="w-full md:w-1/2 flex justify-center">
                <div className="relative w-full aspect-square max-w-lg rounded-[40px] overflow-hidden shadow-2xl bg-white flex items-center justify-center">
                  {herbImage ? (
                    <motion.img
                      key={herbImage}
                      initial={{ opacity: 0, scale: 1.1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={herbImage}
                      alt={herbs[slideshowIndex].name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Loader2 className="w-12 h-12 animate-spin text-herb-accent/30" />
                  )}
                </div>
              </div>

              <div className="w-full md:w-1/2 max-w-xl">
                <motion.div
                  key={slideshowIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-center md:text-left"
                >
                  <span className="text-xs uppercase tracking-widest font-bold text-herb-accent/60 mb-2 block">
                    {herbs[slideshowIndex].category}
                  </span>
                  <h2 className="serif text-6xl md:text-7xl mb-6">{herbs[slideshowIndex].name}</h2>
                  <p className="serif text-2xl italic text-herb-ink/80 mb-8 leading-relaxed">
                    {herbs[slideshowIndex].primary_uses}
                  </p>
                  
                  <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                    <div className="bg-white/50 px-4 py-2 rounded-xl border border-herb-accent/10">
                      <span className="text-[10px] uppercase font-bold text-herb-accent block mb-1">Actions</span>
                      <span className="serif text-lg">{herbs[slideshowIndex].effects_actions}</span>
                    </div>
                    <div className="bg-white/50 px-4 py-2 rounded-xl border border-herb-accent/10">
                      <span className="text-[10px] uppercase font-bold text-herb-accent block mb-1">Methods</span>
                      <span className="serif text-lg">{herbs[slideshowIndex].application_methods}</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            <div className="p-12 flex justify-center items-center gap-8">
              <button onClick={prevSlide} className="p-4 rounded-full hover:bg-white text-herb-accent transition-all shadow-sm">
                <ChevronLeft className="w-8 h-8" />
              </button>
              <div className="serif text-xl text-herb-accent/60">
                {slideshowIndex + 1} / {herbs.length}
              </div>
              <button onClick={nextSlide} className="p-4 rounded-full hover:bg-white text-herb-accent transition-all shadow-sm">
                <ChevronRight className="w-8 h-8" />
              </button>
              <button
                onClick={() => herbImage && generateVideo(herbs[slideshowIndex], herbImage)}
                disabled={!herbImage || isRecording}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-herb-accent text-white hover:bg-herb-ink transition-all shadow-sm disabled:opacity-40"
              >
                {isRecording ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {isRecording ? 'Recording…' : 'Save Video'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading && (
        <div className="fixed bottom-8 right-8 bg-white p-4 rounded-2xl shadow-xl border border-herb-accent/10 flex items-center gap-3 z-[200]">
          <Loader2 className="w-5 h-5 animate-spin text-herb-accent" />
          <span className="serif text-sm italic">AI is preparing botanical content...</span>
        </div>
      )}
    </div>
  );
}
