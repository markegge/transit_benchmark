import { useState, useEffect } from 'react';
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

function App() {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyYearly, setAgencyYearly] = useState<AgencyYearly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('filter');
  const [homeAgency, setHomeAgency] = useState<Agency | null>(null);
  const [peerAgencies, setPeerAgencies] = useState<Agency[]>([]);

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
  };

  const handleBack = () => {
    setStep('filter');
  };

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
            agencies={agencies}
            metadata={metadata}
            onSelectAgencies={handleSelectAgencies}
          />
        ) : homeAgency ? (
          <ExploreStep
            homeAgency={homeAgency}
            peerAgencies={peerAgencies}
            agencyYearly={agencyYearly}
            metadata={metadata}
            onBack={handleBack}
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
