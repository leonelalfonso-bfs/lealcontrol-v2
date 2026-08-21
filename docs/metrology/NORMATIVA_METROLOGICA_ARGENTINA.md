# ⚖️ Base de Conocimiento y Reglamentación de Metrología Legal Argentina
## Instrumentos de Pesar de Funcionamiento No Automático (IPNA)

Este documento recopila la doctrina técnica, legal y metrológica aplicable en la República Argentina bajo la **Ley Nacional de Metrología Nº 19.511** (SIMELA) y los reglamentos técnicos dictados por la Secretaría de Comercio / Industria y Comercio y el **INTI**.

---

## 🏛️ 1. Marco Normativo Comparado: Res. 2307/80 vs. Res. 25/2025

| Aspecto Metrológico | Resolución SCyNEI Nº 2307/1980 (Histórica) | Resolución SIyC Nº 25/2025 (Armonizada OIML R 76-1:2006) |
| :--- | :--- | :--- |
| **Denominación del Límite de Error** | **Error Máximo Tolerado (EMT)** | **Error Máximo Permitido (emp / MPE)** |
| **Ensayos de Fidelidad / Repetibilidad** | **Ensayo de Fidelidad**: Desvío entre pesadas $\le \|EMT\|$ | **Ensayo de Repetibilidad**: Desvío $\le \|emp\|$, cálculo de varianza $s^2$ e Incertidumbre $U$ ($k=2$) |
| **Carga de Ensayo de Excentricidad ($n > 4$ apoyos)** | $1/n \cdot (Max + T)$ sobre cada punto de apoyo | $1/(n - 1) \cdot (Max + T^+)$ sobre cada punto de apoyo (ej. balanza de 6 apoyos: carga $= Max / 5$) |
| **Carga de Excentricidad ($\le 4$ apoyos)** | $1/3 \cdot (Max + T)$ en extremos/bordes | $1/3 \cdot (Max + T^+)$ repartida en 4 segmentos |
| **Carga de Excentricidad en Tolvas / Tanques** | $1/10 \cdot (Max + T)$ sobre cada punto de apoyo | $1/10 \cdot (Max + T^+)$ sobre cada punto de apoyo |
| **Carga Rodante (Camioneras)** | Carga máxima concentrada por eje | Carga rodante usual $\le 0.8 \cdot (Max + T^+)$ en entrada, centro y salida |
| **Clasificación de Exactitud** | Precisión Especial (I), Fina (II), Media (III), Ordinaria (IIII) | Exactitud Especial (I), Alta (II), Media (III), Ordinaria (IIII) |
| **Aprobación de Modelo** | Código de Aprobación de Modelo nacional (ex SCT/SCI) | Certificado de Aprobación de Modelo OIML / Res. 25 con evaluación modular (Anexo C, D, E, F, H) |
| **Control Periódico (Periodicidad)** | Anual / 12 meses (según delegación provincial/municipal) | **24 meses** (Artículo 5º de Res. 25/2025) |
| **Régimen de Transición (Art. 6º Res. 25/25)** | Válida para usuarios por **10 años** y fabricantes/reparadores por **5 años** | Obligatoria para nuevos modelos y homologaciones |

---

## 📐 2. Escalares y Tolerancias para Balanzas Clase III (Media - Estándar)

Para balanzas camioneras, de plataforma e industriales de **Clase III (Media)** con escalón $e$:

### Errores Máximos Permitidos (emp / EMT):
| Rango de Carga en escalones ($m/e$) | Verificación Primitiva / Inicial | En Servicio / Verificación Periódica |
| :---: | :---: | :---: |
| **$0 \le m \le 500\,e$** | $\pm 0.5\,e$ | $\pm 1.0\,e$ |
| **$500\,e < m \le 2000\,e$** | $\pm 1.0\,e$ | $\pm 2.0\,e$ |
| **$2000\,e < m \le 10000\,e$** | $\pm 1.5\,e$ | $\pm 3.0\,e$ |

*Ejemplo para Balanza Camionera $Max = 80.000\text{ kg}$, $e = 20\text{ kg}$:*
* Tramo 1: $0\text{ a }10.000\text{ kg}$ ($500\,e$) $\implies emp = \pm 10\text{ kg}$ (primitiva) / $\pm 20\text{ kg}$ (servicio).
* Tramo 2: $10.001\text{ a }40.000\text{ kg}$ ($2000\,e$) $\implies emp = \pm 20\text{ kg}$ (primitiva) / $\pm 40\text{ kg}$ (servicio).
* Tramo 3: $40.001\text{ a }80.000\text{ kg}$ ($4000\,e$) $\implies emp = \pm 30\text{ kg}$ (primitiva) / $\pm 60\text{ kg}$ (servicio).

---

## 🔬 3. Procedimientos de Ensayo en Campo

### 1. Inspección Visual y Conformidad Legal:
* Verificación de placa identificatoria (Marca, Modelo, S/N, Código de Aprobación de Modelo, $Max, Min, e, d$, Clase, Tensión).
* Estado de precintos de seguridad (cable de precintar con sello de plomo de $\varnothing 11\text{ mm}$ o etiqueta destructible).
* Inspección de nivelación y ausencia de roces mecánicos en plataforma.

### 2. Ensayo de Repetibilidad / Fidelidad:
* Realizar 3 series de pesadas sucesivas al $50\%$ y $100\%$ de la capacidad $Max$.
* La diferencia máxima entre lecturas $E_{max} - E_{min}$ debe ser $\le |emp|$.

### 3. Ensayo de Excentricidad de Carga:
* **Balanza con $N > 4$ celdas de carga (Res. 25/2025)**:
  $$L_{ecc} = \frac{Max + T^+}{N - 1}$$
* **Balanza con $N \le 4$ apoyos**:
  $$L_{ecc} = \frac{Max + T^+}{3}$$
* Cada apoyo se ensaya y el error corregido $E_c$ debe ser $\le |emp|$.

### 4. Ensayo de Exactitud / Linealidad (Carga Creciente y Decreciente):
* Al menos 5 escalones representativos ($Min, 500e, 2000e, 50\% Max, 100\% Max$).
* Determinación de punto de cambio mediante sobrecargas $\Delta L$ para eliminar error de redondeo digital ($P = I + 0.5e - \Delta L$).

### 5. Evaluación de Incertidumbre de Calibración (ISO/IEC 17025):
* Incertidumbre combinada:
  $$u_c = \sqrt{u_{pat}^2 + u_{res}^2 + u_{rep}^2 + u_{ecc}^2}$$
* Incertidumbre expandida reportada en certificado con factor de cobertura $k = 2$ (nivel de confianza $95.45\%$):
  $$U = 2 \cdot u_c$$
