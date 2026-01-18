import { useState, useEffect } from 'react';
import { FilterStep } from './components/FilterStep';
import { ExploreStep } from './components/ExploreStep';
import {
  loadMetadata,
  loadAgencies,
  loadAgencyYearly,
  loadAgencyModes,
} from './data';
import type { Metadata, Agency, AgencyYearly, AgencyMode } from './types';
import './App.css';

type Step = 'filter' | 'explore';

function App() {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyYearly, setAgencyYearly] = useState<AgencyYearly[]>([]);
  const [agencyModes, setAgencyModes] = useState<AgencyMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('filter');
  const [selectedAgencies, setSelectedAgencies] = useState<Agency[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [meta, agencyList, yearly, modes] = await Promise.all([
          loadMetadata(),
          loadAgencies(),
          loadAgencyYearly(),
          loadAgencyModes(),
        ]);
        setMetadata(meta);
        setAgencies(agencyList);
        setAgencyYearly(yearly);
        setAgencyModes(modes);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSelectAgencies = (selected: Agency[]) => {
    setSelectedAgencies(selected);
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
        <h1>National Transit Database Dashboard</h1>
        <p className="subtitle">
          {metadata.total_agencies.toLocaleString()} agencies | {metadata.years[0]}-{metadata.years[metadata.years.length - 1]}
        </p>
      </header>

      <main className="app-main">
        {step === 'filter' ? (
          <FilterStep
            agencies={agencies}
            metadata={metadata}
            onSelectAgencies={handleSelectAgencies}
          />
        ) : (
          <ExploreStep
            agencies={selectedAgencies}
            agencyYearly={agencyYearly}
            agencyModes={agencyModes}
            metadata={metadata}
            onBack={handleBack}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>Data source: National Transit Database (NTD) | Federal Transit Administration</p>
      </footer>
    </div>
  );
}

export default App;
