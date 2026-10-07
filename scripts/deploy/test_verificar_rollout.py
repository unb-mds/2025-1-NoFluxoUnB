"""Testes do verificar_rollout.py (sem rede: commit_no_ar é substituído)."""

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import verificar_rollout as vr  # noqa: E402

SHA = "064b4488a1b2c3d4e5f60718293a4b5c6d7e8f90"


class MesmoCommitTest(unittest.TestCase):
    def test_sha_completo_e_abreviado(self):
        self.assertTrue(vr.mesmo_commit(SHA, SHA))
        self.assertTrue(vr.mesmo_commit(SHA[:8], SHA))
        self.assertTrue(vr.mesmo_commit(SHA, SHA[:7]))

    def test_versao_antiga_ou_sem_commit_nao_passa(self):
        self.assertFalse(vr.mesmo_commit("877b0c7b", SHA))
        self.assertFalse(vr.mesmo_commit(None, SHA))
        self.assertFalse(vr.mesmo_commit("", SHA))
        # prefixo curto demais casaria por acaso
        self.assertFalse(vr.mesmo_commit("064", SHA))


class AppsDoAlvoTest(unittest.TestCase):
    def test_all_verifica_os_tres_apps(self):
        chaves = {cfg.key for cfg in vr.apps_do_alvo("all")}
        self.assertEqual(chaves, {"backend", "frontend", "mcp-agent"})

    def test_alvo_unico(self):
        self.assertEqual([c.key for c in vr.apps_do_alvo("backend")], ["backend"])

    def test_alvo_desconhecido(self):
        with self.assertRaises(SystemExit):
            vr.apps_do_alvo("banco")


class EsperarTest(unittest.TestCase):
    def test_passa_quando_a_versao_nova_entra(self):
        respostas = iter(["877b0c7b", "877b0c7b", SHA])
        with mock.patch.object(
            vr, "commit_no_ar", lambda cfg: next(respostas)
        ), mock.patch.object(vr.time, "sleep"):
            self.assertTrue(vr.esperar(vr.apps_do_alvo("backend"), SHA, 60, 0))

    def test_falha_se_continua_na_versao_antiga(self):
        # o que aconteceu em 06/10/2026: deploy "verde" com o backend antigo no ar
        relogio = iter(range(0, 10_000, 30))
        with mock.patch.object(
            vr, "commit_no_ar", lambda cfg: "877b0c7b"
        ), mock.patch.object(vr.time, "sleep"), mock.patch.object(
            vr.time, "monotonic", lambda: next(relogio)
        ):
            self.assertFalse(vr.esperar(vr.apps_do_alvo("backend"), SHA, 600, 15))


if __name__ == "__main__":
    unittest.main()
