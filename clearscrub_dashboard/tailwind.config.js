/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				'50': '#E5F7F0',
  				'100': '#99E6C7',
  				'500': '#008A56',
  				'600': '#006F46',
  				'700': '#00633D',
  				'800': '#003D27',
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			gray: {
  				'50': '#F9FAFB',
  				'100': '#F3F4F6',
  				'200': '#E5E7EB',
  				'300': '#D1D5DB',
  				'400': '#9CA3AF',
  				'500': '#6B7280',
  				'600': '#4B5563',
  				'700': '#374151',
  				'800': '#1F2937',
  				'900': '#111827'
  			},
  			'optimistic-green': '#09B878',
  			'corporate-purple': '#2C14C4',
  			'mild-panic': '#E87B0B',
  			'oh-no': '#DD3424',
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			'6': '6px',
  			'8': '8px',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: [
  				'Geist Sans',
  				'ui-sans-serif',
  				'system-ui',
  				'Segoe UI',
  				'Arial'
  			]
  		},
  		spacing: {
  			'2': '8px',
  			'60': '60px',
  			'220': '220px',
  			'320': '320px',
  			'2.5': '10px'
  		},
  		fontSize: {
  			'11': '11px',
  			'12': '12px',
  			'13': '13px',
  			'14': '14px',
  			'15': '15px',
  			'16': '16px',
  			'20': '20px',
  			'24': '24px',
  			'28': '28px',
  			'32': '32px',
  			'36': '36px',
  			'40': '40px',
  			'48': '48px'
  		},
  		fontWeight: {
  			'500': '500',
  			'600': '600',
  			'700': '700'
  		},
  		boxShadow: {
  			sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  			md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  			focus: '0 0 0 3px rgba(0, 111, 70, 0.1)'
  		},
  		gridTemplateColumns: {
  			table: '40px 160px 220px 160px 200px 140px 100px 120px 120px 40px',
  			'table-mobile': '1fr',
  			layout: '220px 1fr',
  			'layout-mobile': '1fr',
  			detail: '1fr 320px',
  			'detail-mobile': '1fr'
  		},
  		gridTemplateRows: {
  			layout: '60px 1fr'
  		},
  		screens: {
  			xs: '475px',
  			sm: '640px',
  			md: '768px',
  			lg: '1024px',
  			xl: '1280px',
  			'2xl': '1536px'
  		},
  		transitionProperty: {
  			all: 'all'
  		},
  		transitionDuration: {
  			'150': '150ms',
  			'200': '200ms'
  		},
  		transitionTimingFunction: {
  			ease: 'ease'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
