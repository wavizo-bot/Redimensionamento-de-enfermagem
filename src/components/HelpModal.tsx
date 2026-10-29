import { Icon } from './Icons';
import { Modal } from './ui';
import { CONTACT_EMAIL, CONTACT_PHONE_LABEL, LEGAL_URL, PRIVACY_URL } from '../lib/site';

const open = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Como funciona o dimensionamento"
      subtitle="Um guia curto, sem termos difíceis, para entender o que o aplicativo calcula."
      onClose={onClose}
      wide
    >
      <div className="stack-lg prose">
        <section>
          <h3>O que é dimensionamento de enfermagem?</h3>
          <p>
            É a conta que mostra quantos profissionais de enfermagem uma unidade precisa para dar conta
            do trabalho com segurança. O aplicativo usa o método <strong>WISN/WPSN</strong>, indicado no
            Parecer Normativo COFEN nº 1/2024 para a atenção básica.
          </p>
          <p>
            A ideia é simples: se sabemos quantos procedimentos foram feitos no ano e quanto tempo cada
            um leva, sabemos quantas horas de trabalho existem. Dividindo essas horas pelo tempo que cada
            profissional tem disponível, chegamos ao número necessário.
          </p>
        </section>

        <section>
          <h3>As cinco etapas</h3>
          <ol className="help-steps">
            <li>
              <strong>Unidade e jornada.</strong> Nome, período e carga horária semanal. Isso define os
              dias previstos no ano.
            </li>
            <li>
              <strong>Equipe.</strong> Quem trabalha hoje, por nome ou apenas a quantidade. Também dá para
              marcar quem está afastado.
            </li>
            <li>
              <strong>Produção.</strong> Quantos procedimentos de cada tipo foram feitos no ano e quanto
              tempo cada um leva. Os tempos já vêm preenchidos com a referência da planilha.
            </li>
            <li>
              <strong>Ausências.</strong> Feriados, férias, licenças de saúde e outras licenças. O que não
              for lançado é considerado presença.
            </li>
            <li>
              <strong>Resultado.</strong> O quadro necessário, o saldo e o arquivo Excel pronto.
            </li>
          </ol>
        </section>

        <section>
          <h3>Aproveitar um relatório de procedimentos</h3>
          <p>
            Se a unidade já exporta o “Detalhamento de procedimentos lançados” do e-SUS, o aplicativo
            pode usar esse arquivo como <strong>base parcial</strong>. Ele soma a produção de cada
            procedimento, agrupa nos dez grupos do dimensionamento e separa enfermeiros de
            técnicos/auxiliares quando o relatório permite.
          </p>
          <ul className="bullet-list">
            <li>
              O detalhamento expandido e o relatório por profissional preenchem a produção. O por
              estabelecimento e o total por mês servem somente para conferência.
            </li>
            <li>
              Você escolhe a janela: último ano escolar completo (agosto a julho), últimos 12 meses ou
              todo o período anualizado. O mês corrente fica de fora porque ainda pode estar incompleto.
            </li>
            <li>
              Tempos médios, cuidados indiretos, ausências e quadro atual não vêm do relatório e
              continuam para revisão. Imunizações também precisam ser preenchidas à mão.
            </li>
            <li>
              Os nomes encontrados são sugestão: são pessoas que lançaram produção, não
              necessariamente o quadro atual.
            </li>
          </ul>
        </section>

        <section>
          <h3>Palavras que aparecem no cálculo</h3>
          <dl className="glossary">
            <dt>TTD — Tempo de Trabalho Disponível</dt>
            <dd>
              Quantas horas por ano cada profissional realmente tem para trabalhar, depois de descontar
              feriados, férias e licenças.
            </dd>
            <dt>Cuidados diretos</dt>
            <dd>
              O tempo gasto com o paciente: consulta, medicação, curativo, vacina, visita domiciliar e
              outros procedimentos.
            </dd>
            <dt>Cuidados indiretos</dt>
            <dd>
              O tempo gasto em reuniões, documentação, supervisão, organização e atividades de apoio. Eles
              consomem parte da jornada e por isso aumentam o quadro necessário.
            </dd>
            <dt>WISN</dt>
            <dd>
              O indicador calculado pelo método. É a quantidade de profissionais necessária para a carga
              de trabalho informada.
            </dd>
            <dt>Saldo</dt>
            <dd>
              A equipe atual menos o quadro necessário. Positivo significa folga; negativo significa
              déficit.
            </dd>
          </dl>
        </section>

        <section>
          <h3>O que o aplicativo não faz</h3>
          <ul className="bullet-list">
            <li>Não é um sistema oficial do COFEN, do SUS ou de qualquer órgão público.</li>
            <li>Não é prontuário eletrônico e não guarda dados de pacientes.</li>
            <li>Não substitui a análise do enfermeiro responsável técnico.</li>
            <li>Não inventa a distribuição da produção: quando o relatório não separa os grupos, nada é estimado.</li>
          </ul>
        </section>

        <section>
          <h3>Dados e privacidade</h3>
          <p>
            Tudo fica salvo no seu computador. A sincronização com o Google Drive é opcional: quando
            ativada, o backup vai para uma pasta privada do aplicativo no seu Drive. Nenhum dado de
            paciente deve ser digitado aqui.
          </p>
          <div className="row-actions">
            <button className="btn btn-small btn-ghost" onClick={() => open(PRIVACY_URL)}>
              <Icon name="external" size={15} /> Política de privacidade
            </button>
            <button className="btn btn-small btn-ghost" onClick={() => open(LEGAL_URL)}>
              <Icon name="external" size={15} /> Aviso legal
            </button>
          </div>
        </section>

        <section className="help-contact">
          <Icon name="help" />
          <div>
            <h3>Precisa de ajuda?</h3>
            <p>
              Fale com {CONTACT_EMAIL} ou {CONTACT_PHONE_LABEL}.
            </p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
