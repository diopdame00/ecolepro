CREATE TYPE statut_cours AS ENUM (
  'PROGRAMME',
  'EN_COURS',
  'TERMINE',
  'ANNULE'
);

CREATE TABLE suivi_cours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_slot_id UUID NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
  statut statut_cours NOT NULL DEFAULT 'PROGRAMME',
  motif_annulation TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX idx_suivi_unique_slot
ON suivi_cours(timetable_slot_id);

CREATE INDEX idx_suivi_statut
ON suivi_cours(statut);