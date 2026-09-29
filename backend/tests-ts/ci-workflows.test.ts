import fs from 'fs';
import path from 'path';

// Guardas estáticas dos workflows do GitHub Actions. Ficam na suíte Jest do
// backend porque é a que já tem um parser de YAML (js-yaml, vindo do eslint)
// e roda em todo push na main; o paths-filter do pipelineCI.yml também
// dispara este job quando um desses workflows muda num PR.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml');

const WORKFLOWS = path.join(__dirname, '..', '..', '.github', 'workflows');

function carregar(nome: string): any {
    return yaml.load(fs.readFileSync(path.join(WORKFLOWS, nome), 'utf8'));
}

// O js-yaml (YAML 1.1) lê a chave `on` como o booleano true.
const gatilhos = (wf: any) => wf.on ?? wf[true as any];

describe('deploy.yml só publica com CI verde (pré-mortem 27/09/2026, R23)', () => {
    const deploy = carregar('deploy.yml');
    const ci = carregar('pipelineCI.yml');
    const job = deploy.jobs.deploy;

    it('não dispara mais direto no push (corria em paralelo com o CI)', () => {
        expect(gatilhos(deploy)).not.toHaveProperty('push');
    });

    it('dispara ao fim do workflow CI na main', () => {
        const wr = gatilhos(deploy).workflow_run;
        expect(wr).toBeDefined();
        expect(wr.workflows).toEqual([ci.name]);
        expect(wr.types).toEqual(['completed']);
        expect(wr.branches).toEqual(['main']);
    });

    it('mantém o workflow_dispatch manual com o input target', () => {
        expect(gatilhos(deploy).workflow_dispatch.inputs.target).toBeDefined();
    });

    it('o job só roda com conclusion == success de um push do próprio repo, ou manualmente', () => {
        const cond = String(job.if).replace(/\s+/g, ' ');
        expect(cond).toContain("github.event_name == 'workflow_dispatch'");
        expect(cond).toContain("github.event.workflow_run.conclusion == 'success'");
        // workflow_run com branches: [main] também casa com PR de fork cuja
        // branch se chama main; sem isso o deploy rodaria código de fora com
        // os segredos de produção.
        expect(cond).toContain("github.event.workflow_run.event == 'push'");
        expect(cond).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    });

    it('faz checkout exatamente do SHA que passou no CI', () => {
        const checkout = job.steps.find((s: any) => String(s.uses).startsWith('actions/checkout'));
        expect(checkout.with.ref).toBe('${{ github.event.workflow_run.head_sha || github.sha }}');
    });
});
