// Interfaces para la capa de proveedores de media.
// Cada provider implementa MediaProvider y devuelve Candidates.

export interface Candidate {
  url: string;
  title?: string;
  license?: string;
  source: string;
}

export interface MediaProvider {
  name: string;
  search(query: string, limit?: number): Promise<Candidate[]>;
}