import type { Ref } from 'react';
import type { WorkspaceProject } from '../lib/dashboard-types';

export default function ProjectFields({ project, onChange, nameRef, idPrefix = '' }: {
  project: WorkspaceProject;
  onChange: (project: WorkspaceProject) => void;
  nameRef?: Ref<HTMLInputElement>;
  idPrefix?: string;
}) {
  return (
    <>
      <label htmlFor={`${idPrefix}project-name`}>Project name<input ref={nameRef} id={`${idPrefix}project-name`} required maxLength={100} value={project.name} placeholder="My next good idea" onChange={event => onChange({ ...project, name: event.target.value })} /></label>
      <div className="form-columns">
        <label htmlFor={`${idPrefix}project-url`}>Site URL<input id={`${idPrefix}project-url`} type="url" required maxLength={2048} placeholder="https://example.com" value={project.url} onChange={event => onChange({ ...project, url: event.target.value })} /></label>
        <label htmlFor={`${idPrefix}property-id`}>GA4 property ID<input id={`${idPrefix}property-id`} inputMode="numeric" pattern="[1-9][0-9]{0,19}" required maxLength={20} placeholder="Numeric ID" value={project.propertyId} onChange={event => onChange({ ...project, propertyId: event.target.value })} /></label>
      </div>
      <p className="hint">Find the numeric ID in GA4 → Admin → Property details. Not the G- measurement ID.</p>
    </>
  );
}
