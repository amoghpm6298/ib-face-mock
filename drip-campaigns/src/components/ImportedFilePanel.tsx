// The file an imported campaign came from — viewable and downloadable for
// as long as the campaign exists.
//
// An imported campaign is meant to be edited until it may share nothing with
// what arrived, so the original is the only remaining record of what the
// designer actually proposed. It also carries blocks this app does not read
// (its own validation run, what it left unresolved, why it chose what it
// chose), and those are worth being able to read and pass on.
//
// Read-only on purpose: editing the campaign is what the builder is for.
// Nothing here writes back, so the file can never disagree with itself.
import { useState } from 'react';
import { SideDrawer, SideDrawerHead } from './SideDrawer';

function prettify(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // Not re-parseable: show exactly what is stored rather than nothing.
    return text;
  }
}

function fileNameFor(campaignName: string): string {
  const slug = campaignName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
  return `${slug}-imported.json`;
}

export function ImportedFilePanel({ campaign }: { campaign: { name: string; importedJson?: string; importedAt?: string } }) {
  const [open, setOpen] = useState(false);
  const json = campaign.importedJson;
  if (!json) return null;

  const pretty = prettify(json);
  const when = campaign.importedAt ? new Date(campaign.importedAt).toLocaleString() : null;

  function download() {
    const blob = new Blob([json!], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameFor(campaign.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="imported-file">
        <div>
          <div className="imported-file-title">Imported from a campaign designer file</div>
          <div className="imported-file-sub">
            {when ? `Imported ${when}. ` : ''}Kept exactly as it arrived, whatever this campaign has become since.
          </div>
        </div>
        <div className="imported-file-actions">
          <button className="btn secondary small" onClick={() => setOpen(true)}>
            View file
          </button>
          <button className="btn secondary small" onClick={download}>
            Download
          </button>
        </div>
      </div>

      <SideDrawer open={open} widthPx={720} onClose={() => setOpen(false)}>
        <SideDrawerHead title="Imported file" onClose={() => setOpen(false)} />
        <div className="sd-body">
          <p className="f-hint" style={{ marginTop: 0 }}>
            The file this campaign was imported from. Read-only — edit the campaign itself in the builder.
          </p>
          <pre className="imported-file-json">{pretty}</pre>
        </div>
        <div className="sd-foot">
          <button className="btn secondary" onClick={() => setOpen(false)}>
            Close
          </button>
          <button className="btn primary" onClick={download}>
            Download
          </button>
        </div>
      </SideDrawer>
    </>
  );
}
