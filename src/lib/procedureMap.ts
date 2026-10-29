import { PROCEDURES } from './defaults';

/**
 * Mapeamento dos procedimentos do e-SUS para os dez grupos usados no
 * dimensionamento. O relatório traz nomes longos, com código e variações de
 * acentuação; por isso a comparação é feita sobre o texto normalizado.
 *
 * Quando um procedimento não se encaixa em nenhum grupo, ele fica de fora da
 * base parcial e é mostrado ao usuário para conferência manual.
 */

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** Remove o código do procedimento e pontuação final. */
export function cleanProcedureName(raw: string): string {
  return normalize(raw)
    .replace(/^\d+\s*-\s*/, '')
    .replace(/\s*\.$/, '')
    .trim();
}

/** Procedimentos que pertencem a outras categorias profissionais. */
const OTHER_PROFESSIONAL = [
  /^CONSULTA MEDICA\b/,
  /^CONSULTA MEDICA EM SAUDE DO TRABALHADOR\b/,
  /^TELECONSULTA MEDICA\b/,
  /^CONSULTA EM SAUDE DO TRABALHADOR\b/,
  /^AVALIACAO CARDIOLOGICA\b/,
  /^AVALIACAO DE RISCO CIRURGICO\b/,
  /^ELETROCARDIOGRAMA\b/,
  /^ULTRASSONOGRAFIA\b/,
  /^ENDOSCOPIA\b/,
  /^COLONOSCOPIA\b/,
  /^TESTE ERGOMETRICO\b/,
  /^BIOPSIA\b/,
  /^PUNCAO CIRURGICA\b/,
  /^DRENAGEM DE GLANDULA DE BARTHOLIN\b/,
  /ODONTOLOG/,
  /\bDENTE\b/,
  /\bDENTARIA\b/,
  /EXODONTIA/,
  /RESTAURACAO/,
  /RASPAGEM/,
  /SELAMENTO/,
  /PROFILAXIA/,
  /ENDODONT/,
  /PERIODONT/,
  /PROTESE/,
  /ORTODONT/,
  /CARIOSTATICO/,
  /\bFLUOR\b/,
  /SELANTE/,
  /PULPOTOMIA/,
  /CAPEAMENTO/,
  /ALVEOL/,
  /\bBOCA\b/,
  /MUCOSA ORAL/,
  /GENGIV/,
  /PERICORONARITE/,
  /ULOTOMIA/,
  /ULECTOMIA/,
  /RADIOGRAFIA OCLUSAL/,
  /RADIOGRAFIA PERIAPICAL/,
  /FOTOBIOMODULACAO/,
  /OSTEOTOMIA DAS FRATURAS ALVEOLO/,
  /ENXERTO GENGIVAL/,
  /REBORDO ALVEOLAR/,
  /NEVRALGIAS FACIAIS/,
  /REEMBASAMENTO/,
  /CONTENCAO DE DENTES/,
  /ODONTOSECCAO/,
  /CURETAGEM PERIAPICAL/,
  /SELAMENTO DE PERFURACAO RADICULAR/,
  /FRENECTOMIA/,
  /ADAPTACAO DE PROTESE/,
  /MANUTENCAO PERIODICA DE PROTESE/,
  /TRATAMENTO DE LESOES DA MUCOSA/,
];

/** Regras na ordem em que devem ser aplicadas (a primeira vence). */
const RULES: { key: string; test: RegExp }[] = [
  { key: 'imunizacoes', test: /VACINA|IMUNIZ|VACINACAO/ },
  {
    key: 'visita',
    test: /VISITA DOMICILIAR|ATENDIMENTO DOMICILIAR|VISITA POS OBITO|CONSULTA\/ATENDIMENTO DOMICILIAR/,
  },
  // Preparação para exame é assistência de enfermagem em exames, não punção.
  { key: 'exames', test: /PREPARACAO PARA O ELETROCARDIOGRAMA/ },
  {
    key: 'medicamentos',
    test: /ADMINISTRACAO DE MEDICAMENTOS|MEDICAMENTO.*VIA|INALACAO|NEBULIZACAO/,
  },
  {
    key: 'puncao',
    test: /COLETA DE MATERIAL PARA EXAME LABORATORIAL|COLETA DE SANGUE|PUNCAO VENOSA/,
  },
  {
    key: 'exames',
    test: /COLETA DE MATERIAL PARA EXAME|GLICEMIA CAPILAR|TESTE RAPIDO|TESTE DE GRAVIDEZ|PROVA DO LACO|TESTE DO PESINHO|TESTE DA ORELHINHA|TRIAGEM NEONATAL|TESTE DE HIV|TESTE DE SIFILIS|TESTE DE HEPATITE/,
  },
  {
    key: 'sinais',
    test: /AFERICAO DE PRESSAO|PRESSAO ARTERIAL|ANTROPOMETRICA|MEDICAO DE ALTURA|MEDICAO DE PESO|SINAIS VITAIS|TEMPERATURA|SATURACAO|FREQUENCIA CARDIACA|FREQUENCIA RESPIRATORIA/,
  },
  {
    key: 'educacao',
    test: /ATIVIDADE EDUCATIVA|ACAO COLETIVA|ATENDIMENTO EM GRUPO|TERAPIA EM GRUPO|OFICINA|PRATICAS CORPORAIS|SESSAO DE MEDITACAO|SESSAO DE ANTROPOSOFIA|SESSAO DE AROMATERAPIA|EDUCACAO EM SAUDE|GRUPO DE|TELEORIENTACAO/,
  },
  {
    key: 'demanda',
    test: /ESCUTA INICIAL|ACOLHIMENTO|DEMANDA ESPONT|CLASSIFICACAO DE RISCO|ATENDIMENTO DE URGENCIA/,
  },
  {
    key: 'consulta',
    test: /^CONSULTA|^TELECONSULTA|AVALIACAO DO DESENVOLVIMENTO|AVALIACAO DO CRESCIMENTO|AVALIACAO MULTIDIMENSIONAL|CONSULTA PRE-NATAL|CONSULTA PUERPERAL|TELEMONITORAMENTO|ADESAO A ASSISTENCIA PRE-NATAL|CONCLUSAO DA ASSISTENCIA PRE-NATAL/,
  },
  {
    key: 'ambulatoriais',
    test: /CURATIVO|RETIRADA DE PONTOS|CATETERISMO|SONDAGEM|LAVAGEM|DRENAGEM|EXCISAO|SUTURA|DEBRIDAMENTO|REMOCAO DE CERUMEN|CAUTERIZACAO|INSERCAO DO DISPOSITIVO|RETIRADA DO DISPOSITIVO|INSERCAO DO IMPLANTE|RETIRADA DO IMPLANTE|RETIRADA DE CORPO ESTRANHO|SESSAO DE AURICULOTERAPIA|SESSAO DE MASSOTERAPIA|TRATAMENTO EM MEDICINA TRADICIONAL CHINESA|ORDENHA MAMARIA|EXAME DO PE DIABETICO/,
  },
];

export function mapProcedureToGroup(raw: string): string | null {
  const name = cleanProcedureName(raw);
  if (!name) return null;
  if (OTHER_PROFESSIONAL.some((test) => test.test(name))) return null;
  const found = RULES.find((rule) => rule.test.test(name));
  return found?.key ?? null;
}

/** Usado nos testes para garantir que todas as regras apontam para grupos existentes. */
export function validateProcedureMap(): string[] {
  const valid = new Set(PROCEDURES.map((p) => p.key));
  return RULES.filter((rule) => !valid.has(rule.key)).map((rule) => rule.key);
}
