import type { Ref } from 'react';
import type { WorkspaceProject } from '../lib/dashboard-types';

export default function ProjectFields({ project, onChange, nameRef }: {
  project: WorkspaceProject;
  onChange: (project: WorkspaceProject) => void;
  nameRef?: Ref<HTMLInputElement>;
}) {
  return (
    <>
      <label htmlFor="project-name">Project name<input ref={nameRef} id="project-name" required maxLength={100} value={project.name} placeholder="My next good idea" onChange={event => onChange({ ...project, name: event.target.value })} /></label>
      <div className="form-columns">
        <label htmlFor="project-url"><span>Site URL <span className="hint">(optional)</span></span><input id="project-url" type="url" maxLength={2048} placeholder="https://example.com" value={project.url} onChange={event => onChange({ ...project, url: event.target.value })} /></label>
        <label htmlFor="property-id">GA4 property ID<input id="property-id" inputMode="numeric" pattern="[1-9][0-9]{0,19}" required maxLength={20} placeholder="Numeric ID" value={project.propertyId} onChange={event => onChange({ ...project, propertyId: event.target.value })} /></label>
      </div>
      <p className="hint">Find the numeric ID in GA4 → Admin → Property details. Not the G- measurement ID.</p>
    </>
  );
}
