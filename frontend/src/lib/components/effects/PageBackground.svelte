<!--
  Fundo padrão NOFLX: base do tema (--background), malha técnica sutil, glows roxos via --primary.
  Componente único usado em todas as páginas (substitui GraffitiBackground e AnimatedBackground).
  No tema escuro mantém a base #050505 e a malha branca originais.
-->
<div class="nofluxo-bg" aria-hidden="true">
	<div class="nofluxo-bg-mesh"></div>
	<div class="nofluxo-bg-glow nw"></div>
	<div class="nofluxo-bg-glow se"></div>
</div>

<style>
	.nofluxo-bg {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
		background: hsl(var(--background));
	}

	:global(.dark) .nofluxo-bg {
		background: #050505;
	}

	.nofluxo-bg-mesh {
		position: absolute;
		inset: 0;
		opacity: 0.05;
		background-image:
			linear-gradient(hsl(var(--foreground) / 0.04) 1px, transparent 1px),
			linear-gradient(90deg, hsl(var(--foreground) / 0.04) 1px, transparent 1px);
		background-size: 56px 56px;
		mask-image: radial-gradient(
			ellipse 85% 70% at 50% 45%,
			rgba(0, 0, 0, 0.55),
			transparent 100%
		);
		-webkit-mask-image: radial-gradient(
			ellipse 85% 70% at 50% 45%,
			rgba(0, 0, 0, 0.55),
			transparent 100%
		);
	}

	:global(.dark) .nofluxo-bg-mesh {
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
	}

	.nofluxo-bg-glow {
		position: absolute;
		pointer-events: none;
		width: 65%;
		height: 60%;
		filter: blur(110px);
		opacity: 0.22;
		border-radius: 50%;
		background: hsl(var(--primary) / 0.45);
	}

	.nofluxo-bg-glow.nw {
		top: -18%;
		left: -14%;
	}

	.nofluxo-bg-glow.se {
		bottom: -24%;
		right: -16%;
		opacity: 0.18;
	}
</style>
