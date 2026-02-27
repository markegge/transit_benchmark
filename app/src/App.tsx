import { useState, useEffect, useCallback, useRef } from 'react';
import { FilterStep } from './components/FilterStep';
import { ExploreStep } from './components/ExploreStep';
import {
  loadMetadata,
  loadAgencies,
  loadAgencyYearly,
} from './data';
import type { Metadata, Agency, AgencyYearly } from './types';
import './App.css';

type Step = 'filter' | 'explore';

const COOKIE_HOME_AGENCY = 'ntd_home_agency';
const COOKIE_PEER_AGENCIES = 'ntd_peer_agencies';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${COOKIE_MAX_AGE};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;max-age=0;path=/`;
}

function HelpModal({ onClose, onPlayVideo }: { onClose: () => void; onPlayVideo: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="help-modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="help-modal">
        <button className="help-modal-close" onClick={onClose}>×</button>
        <h2>How to Use Transit Peers</h2>

        <section>
          <h3>Getting Started</h3>
          <ol>
            <li><strong>Select your home agency</strong> — Search by name or NTD ID to pick the transit agency you want to benchmark.</li>
            <li><strong>Filter and rank peers</strong> — Narrow the list by reporter type, transit modes, or states, then use similarity criteria to find the most comparable agencies.</li>
            <li><strong>Compare performance</strong> — View side-by-side charts and tables for your home agency and selected peers across multiple years.</li>
          </ol>
        </section>

        <section>
          <h3>Peer Selection</h3>
          <p>Filters let you narrow the agency list before ranking:</p>
          <ul>
            <li><strong>Transit modes</strong> use AND logic — an agency must operate <em>all</em> selected modes to appear.</li>
            <li><strong>Reporter type</strong> and <strong>states</strong> use OR logic — an agency matching <em>any</em> selected value will appear.</li>
          </ul>
          <p>Similarity ranking scores agencies across criteria like population, ridership, operating cost per trip, and more. Scores are log-normalized so agencies of very different sizes can still be compared meaningfully.</p>
        </section>

        <section>
          <h3>Performance Comparison</h3>
          <p>The Explore step shows time-series charts for metrics including ridership, farebox recovery, cost per trip, and rides per capita. Hover over a chart to see values for each agency. You can also export the data as CSV.</p>
        </section>

        <section>
          <h3>Quick Start Video</h3>
          <p><a href="#" onClick={(e) => { e.preventDefault(); onClose(); onPlayVideo(); }}>Watch the quick start video</a> for a walkthrough of how to use Transit Peers.</p>
        </section>

        <section>
          <h3>About the Data</h3>
          <p>All data comes from the <strong>National Transit Database (NTD)</strong> published by the Federal Transit Administration. Coverage spans 2019–2024 and includes agencies that report ridership data. Some smaller agencies may be excluded if they do not report to the NTD.</p>
        </section>
      </div>
    </div>
  );
}

function VideoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="video-modal-overlay" onClick={onClose}>
      <div className="video-modal" onClick={(e) => e.stopPropagation()}>
        <button className="video-modal-close" onClick={onClose}>&times;</button>
        <iframe
          src="https://www.youtube.com/embed/NKduIzIZUBE?autoplay=1"
          title="How to use Transit Peers"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
}

function App() {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyYearly, setAgencyYearly] = useState<AgencyYearly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('filter');
  const [homeAgency, setHomeAgency] = useState<Agency | null>(null);
  const [peerAgencies, setPeerAgencies] = useState<Agency[]>([]);
  const [filterKey, setFilterKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  // Restore from cookies after agencies are loaded
  useEffect(() => {
    if (agencies.length === 0) return;

    const savedHomeId = getCookie(COOKIE_HOME_AGENCY);
    const savedPeerIds = getCookie(COOKIE_PEER_AGENCIES);

    if (savedHomeId) {
      const home = agencies.find((a) => a.ntd_id === Number(savedHomeId));
      if (home) {
        setHomeAgency(home);
        if (savedPeerIds) {
          const peerIds = savedPeerIds.split(',').map(Number);
          const peers = agencies.filter((a) => peerIds.includes(a.ntd_id));
          if (peers.length > 0) {
            setPeerAgencies(peers);
            setStep('explore');
          }
        }
      }
    }
  }, [agencies]);

  useEffect(() => {
    async function loadData() {
      try {
        const [meta, agencyList, yearly] = await Promise.all([
          loadMetadata(),
          loadAgencies(),
          loadAgencyYearly(),
        ]);
        setMetadata(meta);
        setAgencies(agencyList);
        setAgencyYearly(yearly);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSelectAgencies = (home: Agency, peers: Agency[]) => {
    setHomeAgency(home);
    setPeerAgencies(peers);
    setStep('explore');
    // Save to cookies
    setCookie(COOKIE_HOME_AGENCY, String(home.ntd_id));
    setCookie(COOKIE_PEER_AGENCIES, peers.map((p) => p.ntd_id).join(','));
  };

  const handleBack = () => {
    setStep('filter');
  };

  const handleStartOver = useCallback(() => {
    setHomeAgency(null);
    setPeerAgencies([]);
    setStep('filter');
    setFilterKey((k) => k + 1);
    deleteCookie(COOKIE_HOME_AGENCY);
    deleteCookie(COOKIE_PEER_AGENCIES);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner"></div>
          <p>Loading NTD data...</p>
        </div>
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className="error-screen">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <a className="header-home-link" href="#" onClick={(e) => { e.preventDefault(); handleStartOver(); }}>
          <svg className="header-logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="4" y="6" width="24" height="18" rx="4" fill="white"/>
            <rect x="7" y="9" width="7" height="5" rx="1" fill="#93c5fd"/>
            <rect x="18" y="9" width="7" height="5" rx="1" fill="#93c5fd"/>
            <rect x="4" y="17" width="24" height="3" fill="#bfdbfe"/>
            <circle cx="10" cy="26" r="2.5" fill="white"/>
            <circle cx="22" cy="26" r="2.5" fill="white"/>
            <circle cx="10" cy="26" r="1" fill="#93c5fd"/>
            <circle cx="22" cy="26" r="1" fill="#93c5fd"/>
          </svg>
          <h1>Transit Peers</h1>
        </a>
        <p className="subtitle">
          NTD Transit Benchmarking — Compare {metadata.total_agencies.toLocaleString()} agencies | {metadata.years[0]}-{metadata.years[metadata.years.length - 1]}
        </p>
        <button className="help-button" onClick={() => setShowHelp(true)} title="Help">?</button>
      </header>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} onPlayVideo={() => setShowVideo(true)} />}

      {showVideo && (
        <VideoModal onClose={() => setShowVideo(false)} />
      )}

      <main className="app-main">
        {step === 'filter' ? (
          <FilterStep
            key={filterKey}
            agencies={agencies}
            metadata={metadata}
            initialHomeAgency={homeAgency}
            initialPeerIds={peerAgencies.map((p) => p.ntd_id)}
            onSelectAgencies={handleSelectAgencies}
            onStartOver={handleStartOver}
            onSetShowVideo={setShowVideo}
          />
        ) : homeAgency ? (
          <ExploreStep
            homeAgency={homeAgency}
            peerAgencies={peerAgencies}
            agencyYearly={agencyYearly}
            metadata={metadata}
            onBack={handleBack}
            onStartOver={handleStartOver}
          />
        ) : null}
      </main>

      <footer className="app-footer">
        <p>Data source: National Transit Database (NTD) | Federal Transit Administration</p>
      </footer>
    </div>
  );
}

export default App;
