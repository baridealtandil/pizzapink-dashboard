import re
import os

filepath = '/Users/macbookairnueva/pizzapink-dashboard/frontend/index.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.content = f.read()

# 1. Change title and brand
html = html.replace('<title>Bar Ideal · Dashboard</title>', '<title>Pizza Pink · Dashboard</title>')
html = html.replace('alt="Bar Ideal"', 'alt="Pizza Pink"')
html = html.replace('content="Bar Ideal"', 'content="Pizza Pink"')

# 2. Change Colors (Bar Ideal uses Gold/Violet, Pizza Pink should use Pink)
# Replace some gold/violet with pink variants
html = html.replace('--gold: #F5C542;', '--gold: #EC4899; /* Pink */')
html = html.replace('--violet: #8B5CF6;', '--violet: #F472B6; /* Light Pink */')

# 3. Remove "Mesa (almuerzo-cena) vs Cafetería y otros" Card (lines around 431-440)
# The card contains <div class="card-title">Mesa (almuerzo-cena) vs Cafetería y otros</div>
card_regex = re.compile(r'<div class="card">\s*<div class="card-title">Mesa \(almuerzo-cena\) vs Cafetería y otros</div>.*?</div>\s*</div>', re.DOTALL)
html = card_regex.sub('', html)

# 4. In JS, remove the cafeteria variables and updates
html = html.replace('document.getElementById("seg-comensales").textContent = Number(seg.comensales_mesa).toLocaleString("es-AR");', 'document.getElementById("seg-comensales").textContent = "N/A";')

# Let's just remove the whole segmentacion function parts that update the donut and the table
# Instead of complex regex, we can replace the update logic for the table and donut with empty strings.
donut_update_regex = re.compile(r'// Donut.*?}\);', re.DOTALL)
html = donut_update_regex.sub('', html)

# Also remove references to facturacion_mesa and facturacion_cafeteria in JS
html = re.sub(r'seg\.clientes_cafeteria', '0', html)
html = re.sub(r'seg\.facturacion_cafeteria', '0', html)
html = re.sub(r'seg\.promedio_cafeteria', '0', html)
html = re.sub(r'seg\.facturacion_mesa', '0', html)
html = re.sub(r'seg\.comensales_mesa', '0', html)

# Change the labels in the Turno report to avoid mentioning cafeteria
html = html.replace('Mesa (almuerzo-cena) vs Cafetería y otros', 'Resumen por Turno')
html = html.replace('Personas cafetería/otros', 'Personas extras')
html = html.replace('Facturación cafetería/otros', 'Facturación extra')
html = html.replace('Promedio cafetería/otros', 'Promedio extra')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)

print("HTML processing complete.")
