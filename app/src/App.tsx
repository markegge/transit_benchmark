import { useState, useEffect, useCallback, useRef } from 'react';
import { FilterStep } from './components/FilterStep';
import { ExploreStep } from './components/ExploreStep';
import {
  loadMetadata,
  loadAgencies,
  loadAgencyYearly,
  loadAgencyModeYearly,
} from './data';
import type { Metadata, Agency, AgencyYearly, AgencyModeYearly, Filters, SimilarityCriterion } from './types';
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

function getUrlParams(): { homeId: number | null; peerIds: number[] } {
  const params = new URLSearchParams(window.location.search);
  const homeId = params.get('home') ? Number(params.get('home')) : null;
  const peerIds = params.get('peers')
    ? params.get('peers')!.split(',').map(Number).filter(Boolean)
    : [];
  return { homeId, peerIds };
}

function setUrlParams(homeId: number, peerIds: number[]) {
  const params = new URLSearchParams();
  params.set('home', String(homeId));
  if (peerIds.length > 0) params.set('peers', peerIds.join(','));
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

function clearUrlParams() {
  window.history.replaceState(null, '', window.location.pathname);
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
        <div className="help-modal-header">
          <h2>How to Use Transit Peers</h2>
          <button className="help-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="help-modal-body">
          <h3>Getting Started</h3>
          <ol>
            <li><strong>Select your home agency</strong> — Search by name or NTD ID to pick the transit agency you want to benchmark.</li>
            <li><strong>Filter and rank peers</strong> — Narrow the list by reporter type, transit modes, or states, then use similarity criteria to find the most comparable agencies.</li>
            <li><strong>Compare performance</strong> — View side-by-side charts and tables for your home agency and selected peers across multiple years.</li>
          </ol>

          <h3>Peer Selection</h3>
          <p>Filters let you narrow the agency list before ranking:</p>
          <ul>
            <li><strong>Transit modes</strong> use AND logic — an agency must operate <em>all</em> selected modes to appear.</li>
            <li><strong>Reporter type</strong> and <strong>states</strong> use OR logic — an agency matching <em>any</em> selected value will appear.</li>
          </ul>
          <p>Similarity ranking scores agencies across criteria like population, ridership, operating cost per trip, and more. Scores are log-normalized so agencies of very different sizes can still be compared meaningfully.</p>

          <h3>Performance Comparison</h3>
          <p>The Explore step shows time-series charts for metrics including ridership, farebox recovery, cost per trip, and rides per capita. Hover over a chart to see values for each agency. You can also export the data as CSV.</p>

          <h3>Quick Start Video</h3>
          <p><a href="#" onClick={(e) => { e.preventDefault(); onClose(); onPlayVideo(); }}>Watch the quick start video</a> for a walkthrough of how to use Transit Peers.</p>

          <h3>About the Data</h3>
          <p>All data comes from the <strong>National Transit Database (NTD)</strong> published by the Federal Transit Administration. Coverage spans 2019–2024 and includes agencies that report ridership data. Some smaller agencies may be excluded if they do not report to the NTD.</p>

          <hr className="help-modal-divider" />
          <h3>Transit Tools Suite</h3>
          <div className="transit-tools-section">
            <p>Transit Peers is part of the <strong>Transit Tools</strong> suite. Also available: <a href="https://www.transitfeeds.net" target="_blank" rel="noopener noreferrer">GTFS Builder</a> — a browser-based editor for creating and editing GTFS transit feeds.</p>
          </div>
        </div>
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
  const [agencyModeYearly, setAgencyModeYearly] = useState<AgencyModeYearly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('filter');
  const [homeAgency, setHomeAgency] = useState<Agency | null>(null);
  const [peerAgencies, setPeerAgencies] = useState<Agency[]>([]);
  const [filterKey, setFilterKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    reporterTypes: [],
    ftaPrograms: [],
    modes: [],
    states: [],
    searchQuery: '',
  });
  const [selectedCriteria, setSelectedCriteria] = useState<SimilarityCriterion[]>([
    'population',
    'ridership',
  ]);

  // Restore from URL params (shareable links) or cookies after agencies are loaded
  useEffect(() => {
    if (agencies.length === 0) return;

    // URL params take priority over cookies
    const { homeId: urlHomeId, peerIds: urlPeerIds } = getUrlParams();
    const savedHomeId = urlHomeId !== null ? String(urlHomeId) : getCookie(COOKIE_HOME_AGENCY);
    const savedPeerIds = urlHomeId !== null
      ? (urlPeerIds.length > 0 ? urlPeerIds.join(',') : null)
      : getCookie(COOKIE_PEER_AGENCIES);

    if (savedHomeId) {
      const home = agencies.find((a) => a.ntd_id === Number(savedHomeId));
      if (home) {
        setHomeAgency(home);
        if (savedPeerIds) {
          const peerIds = savedPeerIds.split(',').map(Number);
          const peers = agencies.filter((a) => peerIds.includes(a.ntd_id));
          setPeerAgencies(peers);
          setStep('explore');
          // Sync URL if we restored from cookies
          if (urlHomeId === null) {
            setUrlParams(home.ntd_id, peers.map((p) => p.ntd_id));
          }
        } else if (urlHomeId !== null) {
          // Home specified in URL but no peers — still go to explore
          setStep('explore');
        }
      }
    }
  }, [agencies]);

  useEffect(() => {
    async function loadData() {
      try {
        const [meta, agencyList, yearly, modeYearly] = await Promise.all([
          loadMetadata(),
          loadAgencies(),
          loadAgencyYearly(),
          loadAgencyModeYearly(),
        ]);
        setMetadata(meta);
        setAgencies(agencyList);
        setAgencyYearly(yearly);
        setAgencyModeYearly(modeYearly);
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
    // Save to cookies and URL
    setCookie(COOKIE_HOME_AGENCY, String(home.ntd_id));
    setCookie(COOKIE_PEER_AGENCIES, peers.map((p) => p.ntd_id).join(','));
    setUrlParams(home.ntd_id, peers.map((p) => p.ntd_id));
  };

  const handleBack = () => {
    setStep('filter');
    clearUrlParams();
  };

  const handleStartOver = useCallback(() => {
    setHomeAgency(null);
    setPeerAgencies([]);
    setStep('filter');
    setFilterKey((k) => k + 1);
    setFilters({ reporterTypes: [], ftaPrograms: [], modes: [], states: [], searchQuery: '' });
    setSelectedCriteria(['population', 'ridership']);
    deleteCookie(COOKIE_HOME_AGENCY);
    deleteCookie(COOKIE_PEER_AGENCIES);
    clearUrlParams();
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
            <rect width="32" height="32" rx="8" fill="#E8734A"/>
            <rect x="4" y="8" width="24" height="14" rx="3" fill="#FFF8F0"/>
            <rect x="7" y="11" width="7" height="4" rx="1" fill="#E8734A" opacity="0.7"/>
            <rect x="18" y="11" width="7" height="4" rx="1" fill="#E8734A" opacity="0.7"/>
            <rect x="4" y="16" width="24" height="2.5" fill="#FDECE5"/>
            <circle cx="10" cy="24" r="2.5" fill="#FFF8F0"/>
            <circle cx="22" cy="24" r="2.5" fill="#FFF8F0"/>
            <circle cx="10" cy="24" r="1" fill="#E8734A"/>
            <circle cx="22" cy="24" r="1" fill="#E8734A"/>
          </svg>
          <h1>Transit Peers</h1>
        </a>
        <p className="subtitle">
          NTD Benchmarking — {metadata.total_agencies.toLocaleString()} agencies | {metadata.years[0]}–{metadata.years[metadata.years.length - 1]}
        </p>
        <div className="header-spacer" />
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
            filters={filters}
            onFiltersChange={setFilters}
            selectedCriteria={selectedCriteria}
            onSelectedCriteriaChange={setSelectedCriteria}
            onSelectAgencies={handleSelectAgencies}
            onStartOver={handleStartOver}
            onSetShowVideo={setShowVideo}
          />
        ) : homeAgency ? (
          <ExploreStep
            homeAgency={homeAgency}
            peerAgencies={peerAgencies}
            allAgencies={agencies}
            agencyYearly={agencyYearly}
            agencyModeYearly={agencyModeYearly}
            metadata={metadata}
            onBack={handleBack}
            onStartOver={handleStartOver}
            onPeersChange={setPeerAgencies}
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
