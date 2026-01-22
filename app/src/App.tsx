import { useState, useEffect, useCallback } from 'react';
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
        <h1>NTD Transit Benchmarking</h1>
        <p className="subtitle">
          Compare {metadata.total_agencies.toLocaleString()} agencies | {metadata.years[0]}-{metadata.years[metadata.years.length - 1]}
        </p>
      </header>

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
