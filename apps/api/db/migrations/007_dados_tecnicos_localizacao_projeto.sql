ALTER TABLE projetos
  ADD COLUMN cep VARCHAR(9),
  ADD COLUMN logradouro VARCHAR(300),
  ADD COLUMN numero VARCHAR(30),
  ADD COLUMN complemento VARCHAR(180),
  ADD COLUMN bairro VARCHAR(120),
  ADD COLUMN codigo_ibge_cidade VARCHAR(10),
  ADD COLUMN latitude NUMERIC(10,7),
  ADD COLUMN longitude NUMERIC(10,7),
  ADD COLUMN area_com_laje NUMERIC(12,2),
  ADD COLUMN area_sem_laje NUMERIC(12,2),
  ADD COLUMN processo_aprovacao VARCHAR(80),
  ADD COLUMN pasta_digital VARCHAR(80),
  ADD COLUMN planta_numero VARCHAR(80),
  ADD COLUMN alvara VARCHAR(80),
  ADD COLUMN art VARCHAR(80),
  ADD COLUMN cno_obra VARCHAR(80),
  ADD COLUMN matricula_terreno VARCHAR(80);

UPDATE projetos SET logradouro=endereco WHERE logradouro IS NULL AND endereco IS NOT NULL;

ALTER TABLE projetos ADD CONSTRAINT ck_projetos_coordenadas CHECK (
  (latitude IS NULL AND longitude IS NULL) OR
  (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

ALTER TABLE projetos ADD CONSTRAINT ck_projetos_areas_detalhadas CHECK (
  (area_com_laje IS NULL OR area_com_laje >= 0) AND
  (area_sem_laje IS NULL OR area_sem_laje >= 0)
);
