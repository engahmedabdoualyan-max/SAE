"""Build the SAE AutoSim Hub static site (index.html) from translations and template."""
import json
import os
from _translations_base import translations as base
from _translations_extra import translations as extra

# Merge all 9 languages
translations = {**base, **extra}
langs_json = json.dumps(translations, ensure_ascii=False, indent=2)

# Build language selector options HTML
lang_codes = ['en', 'ar', 'ru', 'hi', 'de', 'zh', 'ja', 'ko', 'fr']
lang_names = {
    'en': 'English', 'ar': 'العربية', 'ru': 'Русский', 'hi': 'हिन्दी',
    'de': 'Deutsch', 'zh': '中文', 'ja': '日本語', 'ko': '한국어', 'fr': 'Français',
}
lang_flags = {
    'en': '🇬🇧', 'ar': '🇪🇬', 'ru': '🇷🇺', 'hi': '🇮🇳',
    'de': '🇩🇪', 'zh': '🇨🇳', 'ja': '🇯🇵', 'ko': '🇰🇷', 'fr': '🇫🇷',
}
lang_options_html = ''
for code in lang_codes:
    selected = 'selected' if code == 'en' else ''
    lang_options_html += f'<option value="{code}" {selected}>{lang_flags[code]} {lang_names[code]}</option>'

# Build the complete HTML using string replacement (no f-string escaping issues)
HTML_TEMPLATE = r'''<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SAE AutoSim Hub</title>
    <meta name="description" content="Pre-calibrated vehicle fleets for chaotic, aggressive traffic environments. Supporting researchers worldwide, with a focus on Arab Countries.">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #0EA5E9;
            --primary-dark: #028AC4;
            --secondary: #6366F1;
            --dark: #1E293B;
            --light: #F8FAFC;
            --accent: #F59E0B;
        }
        * { scroll-behavior: smooth; }
        body { font-family: 'Inter', system-ui, sans-serif; }
        .logo-anim { display: inline-block; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.85; } }
        .gear-rotate { display: inline-block; animation: rotate 8s linear infinite; }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .vehicle-icon { position: absolute; animation: around 6s linear infinite; opacity: 0.8; }
        @keyframes around { 0% { transform: rotate(0deg) translateX(20px) rotate(0deg); } 100% { transform: rotate(360deg) translateX(20px) rotate(-360deg); } }
        .fade-in { animation: fadeIn 0.8s ease-in; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.12); }
        .flag { font-size: 1.3em; margin-right: 6px; }
        .rtl .flag { margin-right: 0; margin-left: 6px; }
        .download-btn { transition: all 0.3s ease; border: 2px dashed var(--primary); background: white; }
        .download-btn:hover { background: var(--primary); transform: scale(1.02); }
        .level-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.7em; font-weight: 600; }
        .lvl0 { background: #FEE2E2; color: #991B2B; }
        .lvl2 { background: #DBEAFE; color: #1E40AF; }
        .lvl45 { background: #DCFCE7; color: #166534; }
        .mpr-knob { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: linear-gradient(to right, var(--primary), var(--secondary)); outline: none; }
        .mpr-knob::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; border-radius: 50%; background: white; border: 2px solid var(--primary); cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
        .platform-btn { transition: all 0.2s ease; }
        .platform-btn.active { background: var(--primary); color: white; }
        .nav-link { transition: color 0.2s ease; }
        .nav-link:hover { color: var(--primary); }
        @media (max-width: 768px) { .hero-bg { min-height: 500px; } .flag { font-size: 1.1em; } }
    </style>
</head>
<body class="bg-slate-50 text-slate-800">

    <!-- Header -->
    <header class="bg-white shadow-sm sticky top-0 z-50">
        <div class="container mx-auto px-4 py-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3 fade-in">
                    <div class="relative w-10 h-10">
                        <div class="gear-rotate absolute inset-0 flex items-center justify-center"><i class="fas fa-cog text-2xl text-slate-400"></i></div>
                        <div class="absolute inset-0 flex items-center justify-center"><i class="fas fa-road text-xl text-primary"></i></div>
                    </div>
                    <div>
                        <h1 class="text-xl font-bold text-slate-800" data-key="t">SAE AutoSim Hub</h1>
                        <p class="text-xs text-slate-500" data-key="m">To assist traffic simulation researchers worldwide.</p>
                    </div>
                </div>
                <nav class="hidden md:flex items-center gap-6">
                    <a href="#hero" class="nav-link text-sm font-medium" data-key="nav_home">Home</a>
                    <a href="#fleets" class="nav-link text-sm font-medium" data-key="nav_math">Fleet</a>
                    <a href="#math" class="nav-link text-sm font-medium">Math</a>
                    <a href="#references" class="nav-link text-sm font-medium" data-key="nav_refs">References</a>
                    <a href="https://github.com" target="_blank" class="nav-link text-sm font-medium" data-key="nav_github">GitHub</a>
                </nav>
                <div class="flex items-center gap-2">
                    <label for="lang-select" class="text-sm font-medium hidden sm:block" data-key="ls">Language</label>
                    <select id="lang-select" onchange="setLanguage(this.value)" class="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white cursor-pointer">
                        __LANG_OPTIONS__
                    </select>
                </div>
            </div>
        </div>
    </header>

    <!-- Hero -->
    <section id="hero" class="hero-bg min-h-[500px] bg-gradient-to-br from-slate-900 via-slate-800 to-primary-dark text-white flex items-center relative overflow-hidden">
        <div class="absolute inset-0 opacity-10">
            <div class="absolute top-20 left-10 vehicle-icon"><i class="fas fa-car-side text-3xl"></i></div>
            <div class="absolute top-40 right-20 vehicle-icon" style="animation-delay: 1s;"><i class="fas fa-truck-pickup text-3xl"></i></div>
            <div class="absolute bottom-20 left-1/3 vehicle-icon" style="animation-delay: 2s;"><i class="fas fa-bus text-3xl"></i></div>
            <div class="absolute top-1/2 right-10 vehicle-icon" style="animation-delay: 0.5s;"><i class="fas fa-bolt text-3xl text-yellow-300"></i></div>
        </div>
        <div class="container mx-auto px-4 py-16 relative z-10">
            <div class="max-w-4xl">
                <h2 class="text-4xl md:text-5xl font-bold mb-4 fade-in" style="animation-delay: 0.2s;" data-key="h1">Bridging the Local Calibration Deficit</h2>
                <p class="text-xl md:text-2xl mb-6 opacity-90 fade-in" style="animation-delay: 0.4s;" data-key="hs">Pre-calibrated vehicle fleets for chaotic, aggressive, non-lane-based traffic environments</p>
                <div class="prose prose-lg max-w-none fade-in" style="animation-delay: 0.6s;">
                    <p data-key="hd1">Standard simulation defaults <i>(Wiedemann 74/99)</i> collapse in mixed aggressive environments like the Egyptian Ring Road.</p>
                    <p data-key="hd2">Download pre-calibrated configuration files for PTV VISSIM, SUMO, and Aimsun Next — plus Python automation scripts.</p>
                    <p data-key="hd3">Supporting researchers in Egypt, the Arab world, and other developing markets.</p>
                </div>
                <div class="flex flex-wrap gap-3 mt-8 fade-in" style="animation-delay: 0.8s;">
                    <span class="text-sm text-slate-300" data-key="sel">Select Platform</span>
                    <button onclick="switchPlatform('vissim')" data-platform-btn data-platform="vissim" class="platform-btn px-6 py-3 rounded-lg font-semibold flex items-center gap-2">
                        <i class="fas fa-cog"></i><span data-key="vis">PTV VISSIM</span></button>
                    <button onclick="switchPlatform('sumo')" data-platform-btn data-platform="sumo" class="platform-btn px-6 py-3 rounded-lg font-semibold flex items-center gap-2 bg-slate-800/30">
                        <i class="fas fa-network-wired"></i><span data-key="sum">SUMO</span></button>
                    <button onclick="switchPlatform('aimsun')" data-platform-btn data-platform="aimsun" class="platform-btn px-6 py-3 rounded-lg font-semibold flex items-center gap-2 bg-slate-800/30">
                        <i class="fas fa-car"></i><span data-key="aim">Aimsun Next</span></button>
                </div>
                <div class="mt-8 max-w-md fade-in" style="animation-delay: 1s;">
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-sm font-medium" data-key="mpr">AV Market Penetration Rate (MPR)</label>
                        <span id="mpr-val" class="text-xl font-bold text-yellow-300">30%</span>
                    </div>
                    <input type="range" min="0" max="100" value="30" id="mpr-slider" class="mpr-knob w-full h-2 rounded-full" oninput="updateMPR(this.value)">
                    <div class="h-2 bg-slate-700/50 rounded-full mt-2 overflow-hidden">
                        <div id="mpr-bar" class="h-full bg-gradient-to-r from-green-400 to-yellow-300 rounded-full transition-all" style="width: 30%"></div>
                    </div>
                    <p class="text-xs text-slate-300 mt-1" data-key="mprd">Adjust the slider to set the proportion of autonomous vehicles in the traffic stream.</p>
                </div>
                <div class="mt-8 fade-in" style="animation-delay: 1.2s;">
                    <button onclick="document.getElementById('filehub').scrollIntoView({behavior:'smooth'})" class="px-8 py-4 bg-white text-primary font-bold rounded-xl text-lg hover:bg-yellow-400 hover:text-slate-900 transition-all shadow-lg flex items-center gap-3">
                        <i class="fas fa-download"></i><span data-key="cta1">Download Configurations</span>
                    </button>
                    <button onclick="document.getElementById('math').scrollIntoView({behavior:'smooth'})" class="px-8 py-4 bg-transparent border-2 border-white text-white font-bold rounded-xl text-lg hover:bg-white hover:text-primary transition-all shadow-lg flex items-center gap-3 fade-in" style="animation-delay: 1.4s;">
                        <i class="fas fa-calculator"></i><span data-key="cta2">View Documentation</span>
                    </button>
                    <div class="mt-4 text-center" data-key="gen" id="gen-display"></div>
                </div>

    <!-- Fleet Documentation -->
    <section id="fleets" class="py-16 bg-white">
        <div class="container mx-auto px-4">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-slate-800 mb-4" data-key="f0">SAE Level 0 - Conventional Fleet (Egyptian)</h2>
                <p class="text-slate-600 max-w-2xl mx-auto" data-key="f0d">The Egyptian conventional fleet dominates todays roads. Microbuses, passenger cars (Mlaiky), and heavy trucks (Naql) exhibit aggressive, non-lane-based driving patterns.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div class="bg-white rounded-xl p-6 border border-slate-200 card-hover">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center"><i class="fas fa-bus text-2xl text-orange-500"></i></div>
                        <h3 class="font-bold text-lg" data-key="mb">Egyptian Microbus</h3>
                    </div>
                    <p class="text-sm text-slate-600 mb-3" data-key="mbd">High acceleration/deceleration, zero lateral headway, aggressive lane changes, frequent roadside stops (mean dwell ~25s, ~0.4 stops/km).</p>
                    <div class="bg-slate-50 rounded-lg p-3 text-xs font-mono"><span data-key="mbp">Accel: 3.0 | Decel: 6.0 | tau: 0.7s | Safety: 0.35 | sigma: 0.95</span></div>
                </div>
                <div class="bg-white rounded-xl p-6 border border-slate-200 card-hover">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center"><i class="fas fa-car-side text-2xl text-blue-500"></i></div>
                        <h3 class="font-bold text-lg" data-key="ml">Mlaiky (Passenger Cars)</h3>
                    </div>
                    <p class="text-sm text-slate-600 mb-3" data-key="mld">Reduced safety distances, high cooperative lane-changing thresholds, unpredictable cut-ins.</p>
                    <div class="bg-slate-50 rounded-lg p-3 text-xs font-mono"><span data-key="mlp">Accel: 2.4 | Decel: 5.0 | tau: 0.85s | Safety: 0.45 | sigma: 0.85</span></div>
                </div>
                <div class="bg-white rounded-xl p-6 border border-slate-200 card-hover">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center"><i class="fas fa-truck-loading text-2xl text-amber-600"></i></div>
                        <h3 class="font-bold text-lg" data-key="nt">Naql (Heavy Trucks)</h3>
                    </div>
                    <p class="text-sm text-slate-600 mb-3" data-key="ntd">Low power-to-weight, extended braking distances, night-dominant lane usage.</p>
                    <div class="bg-slate-50 rounded-lg p-3 text-xs font-mono"><span data-key="ntp">Accel: 0.9 | Decel: 4.5 | tau: 1.3s | Safety: 0.55 | sigma: 0.75 | Night</span></div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 card-hover">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center"><i class="fas fa-cruise-control text-2xl text-blue-600"></i></div>
                        <h3 class="font-bold text-lg" data-key="f2">SAE Level 2 - Partial Automation</h3>
                    </div>
                    <p class="text-sm text-slate-600" data-key="f2d">ACC with rigid lane-keeping. Reaction ~1.1s, safety 0.75, sigma 0.15.</p>
                    <div class="bg-white rounded-lg p-3 text-xs font-mono mt-2"><span data-key="f2p">Accel: 1.8 | Decel: 3.2 | tau: 1.1s | Safety: 0.75 | sigma: 0.15</span></div>
                </div>
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 card-hover">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center"><i class="fas fa-bolt text-2xl text-green-600"></i></div>
                        <h3 class="font-bold text-lg" data-key="f4">SAE Level 4 & 5 - Full Automation</h3>
                    </div>
                    <p class="text-sm text-slate-600" data-key="f4d">V2X-enabled CACC platoons with near-zero safety headways. Defensive mode activates when cut off by Level 0 vehicles.</p>
                    <div class="bg-white rounded-lg p-3 text-xs font-mono mt-2"><span data-key="f4p">Accel: 2.2 | Decel: 3.5 | tau: 0.35s | Safety: 0.95 | sigma: 0.01 | CACC: 0.3s</span></div>
                </div>
            </div>
        </div>
    </section>

    <!-- Math Section -->
    <section id="math" class="py-12 bg-slate-900 text-white">
        <div class="container mx-auto px-4">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold mb-4" data-key="math">Mathematical Mappings</h2>
                <p class="text-slate-300" data-key="mathd">Wiedemann 99 * SUMO Krauss * IDM - All share the same kinematic base sqrt(a*b)</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div class="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <h4 class="font-bold mb-2 text-primary">Wiedemann 99 (VISSIM)</h4>
                    <code class="text-sm text-slate-300 block" data-key="m1">d = CC0 + v*tau*safety + v*(v-vl)/(2*sqrt(a*b))*safety</code>
                </div>
                <div class="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <h4 class="font-bold mb-2 text-primary">Krauss (SUMO)</h4>
                    <code class="text-sm text-slate-300 block" data-key="m2">s* = minGap + v*tau - v*(vl-v)/(2*sqrt(a*b))</code>
                </div>
                <div class="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <h4 class="font-bold mb-2 text-primary">TTC (Conflict Detection)</h4>
                    <code class="text-sm text-slate-300 block" data-key="m3">TTC = gap / (v_follower - v_leader)</code>
                </div>
                <div class="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <h4 class="font-bold mb-2 text-primary">Emergency Braking</h4>
                    <code class="text-sm text-slate-300 block" data-key="m4">a = v^2 / (2*gap)</code>
                </div>
            </div>
        </div>
    </section>

    <!-- Parameter Table -->
    <section class="py-12 bg-white">
        <div class="container mx-auto px-4">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-slate-800 mb-4" data-key="param_table">Parameter Comparison</h2>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full max-w-4xl mx-auto border-collapse">
                    <thead>
                        <tr class="bg-slate-100">
                            <th class="p-3 text-left" data-key="vehicle">Vehicle</th>
                            <th class="p-3" data-key="level">Level</th>
                            <th class="p-3" data-key="reaction">Reaction tau (s)</th>
                            <th class="p-3" data-key="safety_factor">Safety</th>
                            <th class="p-3" data-key="accel">Accel</th>
                            <th class="p-3" data-key="decel">Decel</th>
                            <th class="p-3" data-key="sigma">Sigma</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <tr class="hover:bg-slate-50"><td class="p-3 font-medium">Egyptian Microbus</td><td class="p-3"><span class="level-badge lvl0">L0</span></td><td class="p-3">0.70</td><td class="p-3">0.35</td><td class="p-3">3.0</td><td class="p-3">6.0</td><td class="p-3">0.95</td></tr>
                        <tr class="hover:bg-slate-50"><td class="p-3 font-medium">Mlaiky (Car)</td><td class="p-3"><span class="level-badge lvl0">L0</span></td><td class="p-3">0.85</td><td class="p-3">0.45</td><td class="p-3">2.4</td><td class="p-3">5.0</td><td class="p-3">0.85</td></tr>
                        <tr class="hover:bg-slate-50"><td class="p-3 font-medium">Naql (Truck)</td><td class="p-3"><span class="level-badge lvl0">L0</span></td><td class="p-3">1.30</td><td class="p-3">0.55</td><td class="p-3">0.9</td><td class="p-3">4.5</td><td class="p-3">0.75</td></tr>
                        <tr class="hover:bg-blue-50"><td class="p-3 font-medium">AV SAE L2</td><td class="p-3"><span class="level-badge lvl2">L2</span></td><td class="p-3">1.10</td><td class="p-3">0.75</td><td class="p-3">1.8</td><td class="p-3">3.2</td><td class="p-3">0.15</td></tr>
                        <tr class="hover:bg-green-50"><td class="p-3 font-medium">AV SAE L4-5</td><td class="p-3"><span class="level-badge lvl45">L4-5</span></td><td class="p-3">0.35</td><td class="p-3">0.95</td><td class="p-3">2.2</td><td class="p-3">3.5</td><td class="p-3">0.01</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="mt-8 text-center">
                <div class="inline-flex items-center gap-4 text-sm text-slate-600">
                    <span class="flex items-center gap-2"><span class="w-3 h-3 bg-red-400 rounded"></span> <span data-key="egyptian_aggressive">Aggressive (Short tau, Low Safety)</span></span>
                    <span class="flex items-center gap-2"><span class="w-3 h-3 bg-green-400 rounded"></span> <span data-key="av_conservative">Conservative (CACC, High Safety)</span></span>
                </div>
            </div>
        </div>
    </section>

    <!-- File Hub -->
    <section id="filehub" class="py-16 bg-slate-100">
        <div class="container mx-auto px-4">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-slate-800 mb-4" data-key="fh">Localized File Download Hub</h2>
                <p class="text-slate-600" data-key="fhd">Download pre-calibrated configuration files mapped to standard directory targets.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div class="bg-white rounded-xl p-6 border-2 border-dashed border-slate-300 text-center card-hover">
                    <div class="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4"><i class="fas fa-cog text-3xl text-indigo-600"></i></div>
                    <h3 class="font-bold text-lg mb-2" data-key="dv">Download VISSIM Fleet</h3>
                    <p class="text-xs text-slate-500 font-mono mb-3" data-key="dv_file">/fleets/custom_egypt_fleet.inpx</p>
                    <p class="text-sm text-slate-600 mb-4" data-key="dvd">PTV VISSIM .inpx configuration with Wiedemann 99 parameters for all Egyptian vehicle types.</p>
                    <button onclick="handleDownload('vissim')" class="w-full download-btn text-indigo-600 font-semibold py-3 rounded-lg flex items-center justify-center gap-2"><i class="fas fa-download"></i><span data-key="dv">Download</span></button>
                </div>
                <div class="bg-white rounded-xl p-6 border-2 border-dashed border-slate-300 text-center card-hover">
                    <div class="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4"><i class="fas fa-network-wired text-3xl text-green-600"></i></div>
                    <h3 class="font-bold text-lg mb-2" data-key="ds">Download SUMO Fleet</h3>
                    <p class="text-xs text-slate-500 font-mono mb-3" data-key="ds_file">/fleets/egypt_sumo_fleet.rou.xml</p>
                    <p class="text-sm text-slate-600 mb-4" data-key="dsd">SUMO .rou.xml with Krauss car-following and SL2015 lane-changing parameters.</p>
                    <button onclick="handleDownload('sumo')" class="w-full download-btn text-green-600 font-semibold py-3 rounded-lg flex items-center justify-center gap-2"><i class="fas fa-download"></i><span data-key="ds">Download</span></button>
                </div>
                <div class="bg-white rounded-xl p-6 border-2 border-dashed border-slate-300 text-center card-hover">
                    <div class="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-4"><i class="fas fa-terminal text-3xl text-orange-600"></i></div>
                    <h3 class="font-bold text-lg mb-2" data-key="dc">Download Override Script</h3>
                    <p class="text-xs text-slate-500 font-mono mb-3" data-key="dc_file">/scripts/vissim_sae_override.py</p>
                    <p class="text-sm text-slate-600 mb-4" data-key="dcd">Python script using TraCI/COM/Aimsun API for real-time TTC-based conflict resolution.</p>
                    <button onclick="handleDownload('script')" class="w-full download-btn text-orange-600 font-semibold py-3 rounded-lg flex items-center justify-center gap-2"><i class="fas fa-download"></i><span data-key="dc">Download</span></button>
                </div>
            </div>
        </div>
    </section>

    <!-- GitHub Banner -->
    <section class="py-12 bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
        <div class="container mx-auto px-4 text-center">
            <div class="max-w-3xl mx-auto">
                <i class="fas fa-globe-americas text-4xl mb-4"></i>
                <h2 class="text-2xl font-bold mb-4" data-key="gb">Contribute on GitHub</h2>
                <p class="text-lg opacity-90 mb-6" data-key="gbd">Are you a researcher from India, Brazil, or another developing market? Upload your local calibration set and help us expand globally!</p>
                <a href="https://github.com/sae-calibration-hub" target="_blank" class="inline-flex items-center gap-3 bg-white text-indigo-700 font-bold px-8 py-4 rounded-xl hover:bg-yellow-400 transition-all shadow-lg">
                    <i class="fab fa-github text-2xl"></i><span>github.com/sae-calibration-hub</span>
                </a>
            </div>
        </div>
    </section>

    <!-- References -->
    <section id="references" class="py-16 bg-white">
        <div class="container mx-auto px-4">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-slate-800 mb-4" data-key="rf">Academic References</h2>
                <p class="text-slate-600 max-w-2xl mx-auto" data-key="rfd">Scientific foundation for all calibrated parameters:</p>
            </div>
            <div class="max-w-4xl mx-auto space-y-6">
                <div class="border-l-4 border-primary pl-6 py-3 card-hover">
                    <p class="text-slate-700" data-key="r1">Ahmed, S. et al. (2023). "Chaotic Traffic Driving Characteristics on the Cairo Ring Road." <i>Journal of Traffic Engineering</i>.</p>
                </div>
                <div class="border-l-4 border-primary pl-6 py-3 card-hover">
                    <p class="text-slate-700" data-key="r2">El-Baset, M. et al. (2022). "Calibration of Microsimulation Models for Non-Lane-Based Traffic in Egypt." <i>IEEE Transactions on Intelligent Transportation Systems</i>.</p>
                </div>
                <div class="border-l-4 border-secondary pl-6 py-3 card-hover">
                    <p class="text-slate-700" data-key="r3">SAE International. (2021). "J3016 - Taxonomy and Definitions for Terms Related to Driving Automation Systems."</p>
                </div>
                <div class="border-l-4 border-secondary pl-6 py-3 card-hover">
                    <p class="text-slate-700" data-key="r4">PTV Group. (2024). "VISSIM 2024 User Manual - Wiedemann 99 Car-Following Model."</p>
                </div>
                <div class="border-l-4 border-secondary pl-6 py-3 card-hover">
                    <p class="text-slate-700" data-key="r5">DLR Institute of Transportation Systems. (2024). "SUMO Documentation - Car-Following Models."</p>
                </div>
                <div class="border-l-4 border-secondary pl-6 py-3 card-hover">
                    <p class="text-slate-700" data-key="r6">Aimsun. (2024). "Aimsun Next 24 User Guide - Microscopic Traffic Simulation."</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-slate-900 text-slate-300 py-8">
        <div class="container mx-auto px-4">
            <div class="flex flex-col md:flex-row justify-between items-center">
<p class="text-sm" data-key="fc">Copyright 2024 SAE AutoSim Hub. Built for the research community.</p>
                <div class="flex items-center gap-4 mt-4 md:mt-0">
                    <a href="https://github.com" target="_blank" class="text-slate-400 hover:text-white transition-colors"><i class="fab fa-github text-xl"></i></a>
                    <span class="text-slate-400 text-sm" data-key="ft">Open-source research tool. MIT License.</span>
                </div>
            </div>
        </div>
    </footer>

    <!-- Translation Data -->
    <script>
    const TRANSLATIONS = __TRANSLATIONS_JSON__;
    const LANG_OPTIONS = [];

    let currentLang = localStorage.getItem('sae-lang') || 'en';
    let currentPlatform = 'vissim';
    let mprValue = 30;

    function t(key) {
        const langData = TRANSLATIONS[currentLang] || TRANSLATIONS['en'];
        return langData ? (langData[key] || key) : key;
    }

    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('sae-lang', lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
        document.body.classList.toggle('rtl', lang === 'ar');
        document.querySelectorAll('[data-key]').forEach(function(el) {
            var key = el.getAttribute('data-key');
            var txt = t(key);
            if (el.tagName === 'INPUT') return;
            if (txt.includes('<')) {
                el.innerHTML = txt;
            } else {
                    el.textContent = txt;
                }
            }
        });
        updateDisplay();
    }

    function switchPlatform(platform) {
        currentPlatform = platform;
        document.querySelectorAll('[data-platform-btn]').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-platform') === platform);
        });
        updateDisplay();
    }

    function updateMPR(value) {
        mprValue = parseInt(value);
        document.getElementById('mpr-bar').style.width = mprValue + '%';
        document.getElementById('mpr-val').textContent = mprValue + '%';
        updateDisplay();
    }

    function updateDisplay() {
        var pd = document.getElementById('platform-display');
        var gd = document.getElementById('gen-display');
        if (pd) pd.textContent = currentPlatform.toUpperCase();
        if (gd) gd.textContent = TRANSLATIONS[currentLang].gen + ' ' + currentPlatform.toUpperCase() + ' - ' + mprValue + '%';
    }

    function handleDownload(type) {
        var platformNames = {
            vissim: 'VISSIM',
            sumo: 'SUMO',
            aimsun: 'Aimsun'
        };
        var msgs = {
            en: 'Download ' + platformNames[currentPlatform] + ' config (MPR: ' + mprValue + '%)',
            ar: 'تحميل إعدادات ' + platformNames[currentPlatform] + ' (MPR: ' + mprValue + '%)',
            ru: 'Скачать ' + platformNames[currentPlatform] + ' (MPR: ' + mprValue + '%)',
            hi: 'डाउनलोड ' + platformNames[currentPlatform] + ' (MPR: ' + mprValue + '%)',
            de: 'Laden Sie ' + platformNames[currentPlatform] + ' Konfiguration herunter (MPR: ' + mprValue + '%)',
            zh: '下载 ' + platformNames[currentPlatform] + ' 配置 (MPR: ' + mprValue + '%)',
            ja: currentPlatform + ' をダウンロード (MPR: ' + mprValue + '%)',
            ko: currentPlatform + ' 다운로드 (MPR: ' + mprValue + '%)',
            fr: 'Télécharger ' + platformNames[currentPlatform] + ' (MPR: ' + mprValue + '%)'
        };
        alert(msgs[currentLang] || msgs.en);
    }

    window.addEventListener('load', function() {
        setLanguage('en');
        updateDisplay();
        document.querySelectorAll('[data-platform-btn]').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-platform') === 'vissim');
        });
    });
    </script>
</body>
</html>'''

# Replace placeholders
html = HTML_TEMPLATE.replace('__LANG_OPTIONS__', lang_options_html)
html = html.replace('__TRANSLATIONS_JSON__', langs_json)

# Create web directory
os.makedirs('web', exist_ok=True)

with open('web/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f'web/index.html generated: {len(html)} chars')
print(f'Translations: {len(translations)} languages')
for lang, data in translations.items():
    print(f'  {lang}: {len(data)} keys')
