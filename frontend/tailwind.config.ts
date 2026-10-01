import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';
import typography from '@tailwindcss/typography';
import forms from '@tailwindcss/forms';

const config: Config = {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				// shadcn-svelte CSS variable colors
				border: 'hsl(var(--border) / <alpha-value>)',
				'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',
				input: 'hsl(var(--input) / <alpha-value>)',
				ring: 'hsl(var(--ring) / <alpha-value>)',
				background: 'hsl(var(--background) / <alpha-value>)',
				foreground: 'hsl(var(--foreground) / <alpha-value>)',
				primary: {
					DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
					foreground: 'hsl(var(--primary-foreground) / <alpha-value>)'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
					foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
					foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
					foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
					foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
					foreground: 'hsl(var(--popover-foreground) / <alpha-value>)'
				},
				card: {
					DEFAULT: 'hsl(var(--card) / <alpha-value>)',
					foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
				},
				// IA (Darcy) — texto/accent lilás e tint de fundo
				ai: {
					DEFAULT: 'hsl(var(--ai) / <alpha-value>)',
					soft: 'hsl(var(--ai-soft) / <alpha-value>)'
				},
				// Linhas de pré-requisito do fluxograma (hex por tema em app.css)
				// Fundo real da página (PageBackground) — chore/tema-light
				'page-background': 'hsl(var(--page-background) / <alpha-value>)',
				status: {
					success: 'hsl(var(--status-success) / <alpha-value>)',
					warning: 'hsl(var(--status-warning) / <alpha-value>)',
					danger: 'hsl(var(--status-danger) / <alpha-value>)',
					info: 'hsl(var(--status-info) / <alpha-value>)',
					completed: 'hsl(var(--status-completed) / <alpha-value>)',
					'in-progress': 'hsl(var(--status-in-progress) / <alpha-value>)',
					available: 'hsl(var(--status-available) / <alpha-value>)',
					failed: {
						DEFAULT: 'hsl(var(--status-failed) / <alpha-value>)',
						ring: 'hsl(var(--status-failed-ring) / <alpha-value>)'
					},
					locked: {
						DEFAULT: 'hsl(var(--status-locked) / <alpha-value>)',
						foreground: 'hsl(var(--status-locked-foreground) / <alpha-value>)',
						border: 'hsl(var(--status-locked-border) / <alpha-value>)'
					},
					'on-solid': 'hsl(var(--status-on-solid) / <alpha-value>)',
					'prereq-ok': 'hsl(var(--status-prereq-ok) / <alpha-value>)',
					'prereq-pending': 'hsl(var(--status-prereq-pending) / <alpha-value>)'
				},
				tag: {
					equivalencia: {
						DEFAULT: 'hsl(var(--tag-equivalencia) / <alpha-value>)',
						foreground: 'hsl(var(--tag-equivalencia-foreground) / <alpha-value>)'
					},
					aproveitamento: {
						DEFAULT: 'hsl(var(--tag-aproveitamento) / <alpha-value>)',
						foreground: 'hsl(var(--tag-aproveitamento-foreground) / <alpha-value>)'
					},
					optativa: {
						DEFAULT: 'hsl(var(--tag-optativa) / <alpha-value>)',
						foreground: 'hsl(var(--tag-optativa-foreground) / <alpha-value>)'
					},
					optatoria: {
						DEFAULT: 'hsl(var(--tag-optatoria) / <alpha-value>)',
						foreground: 'hsl(var(--tag-optatoria-foreground) / <alpha-value>)'
					},
					'modulo-livre': {
						DEFAULT: 'hsl(var(--tag-modulo-livre) / <alpha-value>)',
						foreground: 'hsl(var(--tag-modulo-livre-foreground) / <alpha-value>)'
					}
				},
				crianex: {
					DEFAULT: 'hsl(var(--crianex) / <alpha-value>)',
					violeta: 'hsl(var(--crianex-violeta) / <alpha-value>)',
					magenta: 'hsl(var(--crianex-magenta) / <alpha-value>)'
				},
				edge: {
					prereq: 'var(--edge-prereq)',
					dep: 'var(--edge-dep)',
					coreq: 'var(--edge-coreq)'
				},
				// Cadeia topológica (hover/roadmap) — alinhado a CHAIN_VISUAL no dark
				chain: {
					pre: 'var(--chain-pre)',
					desc: 'var(--chain-desc)',
					core: 'var(--chain-core)',
					// mesmas cores em HSL, com suporte a opacidade (chore/tema-light)
					focus: 'hsl(var(--chain-focus) / <alpha-value>)',
					precursor: 'hsl(var(--chain-precursor) / <alpha-value>)',
					descendant: 'hsl(var(--chain-descendant) / <alpha-value>)'
				},

				// NoFluxo Custom Colors (from Flutter AppColors)
				nofluxo: {
					primary: '#6C63FF',
					'primary-dark': '#5A52D5',
					purple: '#9C27B0',
					pink: '#E91E63',
					yellow: '#FFC107',
					black: '#000000',
					white: '#FFFFFF',
					gray: '#9E9E9E',
					'dark-gray': '#424242',
					dialog: '#1A1A1A',
					// Course card gradients
					'completed-start': 'rgb(45, 192, 99)',
					'completed-end': 'rgb(11, 125, 53)',
					'current-start': '#A78BFA',
					'current-end': '#8B5CF6',
					'selected-start': '#FB7185',
					'selected-end': '#E11D48',
					'optative-start': '#3B82F6',
					'optative-end': '#1D4ED8',
					'ready-start': '#F59E0B',
					'ready-end': '#D97706'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				cta: '30px',
				card: '14px'
			},
			fontFamily: {
				sans: ['Inter', 'Poppins', ...fontFamily.sans],
				poppins: ['Poppins', 'sans-serif'],
				mono: ['JetBrains Mono', ...fontFamily.mono]
			},
			boxShadow: {
				// Definidas por tema em app.css (:root = light discreta, .dark = valores originais)
				nofluxo: 'var(--nf-shadow-card)',
				nofluxoLg: 'var(--nf-shadow-card-lg)'
			},
			spacing: {
				section: 'var(--spacing-section)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--bits-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--bits-accordion-content-height)' },
					to: { height: '0' }
				},
				'gradient-shift': {
					'0%, 100%': { backgroundPosition: '0% 50%' },
					'50%': { backgroundPosition: '100% 50%' }
				},
				'pulse-scale': {
					'0%, 100%': { transform: 'scale(1)' },
					'50%': { transform: 'scale(1.05)' }
				},
				'fade-in': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				'slide-up': {
					'0%': { transform: 'translateY(20px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'gradient-shift': 'gradient-shift 3s ease infinite',
				'pulse-scale': 'pulse-scale 2s ease-in-out infinite',
				'fade-in': 'fade-in 0.3s ease-out',
				'slide-up': 'slide-up 0.4s ease-out'
			}
		}
	},
	plugins: [typography, forms]
};

export default config;
