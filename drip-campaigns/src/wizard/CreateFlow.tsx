// Create: from scratch or import. Scratch is the existing wizard, untouched.
import { useState } from 'react';
import type { DripCampaign } from '../data/graphTypes';
import { parseCampaignFile } from '../data/ingestCampaign';
import { DripBuilder, type DripBuilderPayload } from './DripBuilder';
import './dripBuilder.css';

export function CreateFlow({
  nextId,
  onImported,
  onBack,
  onSaveDraft,
  onSubmit,
}: {
  nextId: string;
  onImported: (campaign: DripCampaign) => void;
  onBack: () => void;
  onSaveDraft: (payload: DripBuilderPayload) => void;
  onSubmit: (payload: DripBuilderPayload) => void;
}) {
  const [mode, setMode] = useState<'choose' | 'scratch' | 'import'>('choose');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);

  function applyText(text: string) {
    const result = parseCampaignFile(text, nextId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onImported(result.campaign);
  }

  if (mode === 'scratch') {
    return <DripBuilder onBack={onBack} onSaveDraft={onSaveDraft} onSubmit={onSubmit} />;
  }

  if (mode === 'import') {
    return (
      <div className="dcb-mid">
        <div className="dcb-mid-inner" style={{ maxWidth: 640, padding: 24 }}>
          <button className="btn" onClick={() => { setMode('choose'); setError(null); }}>
            Back
          </button>
          <h1 className="wiz-heading" style={{ marginTop: 16 }}>Import a campaign</h1>
          <p className="wiz-sub">Paste JSON from the campaign designer, or upload the downloaded file.</p>
          <textarea
            className="f-input"
            rows={12}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="{ &quot;campaign&quot;: { &quot;name&quot;: &quot;…&quot;, &quot;root&quot;: { … } } }"
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <label className="btn">
              Upload JSON
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  input.value = '';
                  if (!file) return;
                  setError(null);
                  file
                    .text()
                    .then(applyText)
                    .catch(() => setError('That file could not be read.'));
                }}
              />
            </label>
            <button className="btn primary" disabled={!paste.trim()} onClick={() => applyText(paste)}>
              Continue
            </button>
          </div>
          {error ? <p className="wiz-sub" style={{ color: 'var(--error-text)', marginTop: 12 }}>{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="dcb-mid">
      <div className="dcb-mid-inner" style={{ maxWidth: 720, padding: 24 }}>
        <button className="btn" onClick={onBack}>Back</button>
        <h1 className="wiz-heading" style={{ marginTop: 16 }}>New drip campaign</h1>
        <p className="wiz-sub">Start empty, or bring in a campaign the designer downloaded.</p>
        <div className="create-choose">
          <button type="button" className="create-choose-card" onClick={() => setMode('scratch')}>
            <strong>Create from scratch</strong>
            <span>Basic details, goal, then the canvas — same as today.</span>
          </button>
          <button type="button" className="create-choose-card" onClick={() => setMode('import')}>
            <strong>Import</strong>
            <span>Paste or upload JSON from the campaign designer.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
