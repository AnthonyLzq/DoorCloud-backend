import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Obtiene la ruta absoluta del archivo CSV
script_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(script_dir, '../metrics/matchPhoto.csv')

# Lee los datos del archivo CSV
data = pd.read_csv(data_dir)

# Selecciona la tercera columna de los datos
data_c1 = data.iloc[:,1]

# Contar la cantidad de casos de éxito y fracaso
counts = data.iloc[:, 0].value_counts()
print('counts[0]', counts[0])
print('counts[1]', counts[1])

# Calcular el coeficiente de identificación
coef = data.iloc[:, 0].mean()
print('coef', coef)

# Obtiene el valor mínimo y máximo
min_val = data_c1.min()
max_val = data_c1.max()

# Genera los intervalos
intervalos = np.linspace(min_val, max_val, 11)

# Genera las barras del histograma con un espacio entre ellas
plt.bar(
  intervalos[:-1],
  np.histogram(data_c1, bins = intervalos)[0],
  width = intervalos[1]-intervalos[0],
  edgecolor = 'k',
  linewidth = 1,
  align = 'edge'
)

# Agrega etiquetas al eje x e y
plt.xlabel('Tiempo (s)')
plt.ylabel('Frecuencia')

# Agrega grilla detrás de las barras
plt.grid(linestyle = 'dotted')

#Establece los puntos de corte en el eje x con 2 decimales
plt.xticks(np.round(intervalos[:-1],2))

#Agrega título al gráfico
plt.title("Latencia de Detección")

# Agrega una línea vertical para la media
plt.axvline(
  data_c1.mean(),
  color = 'red',
  linestyle = 'dashed',
  linewidth = 2,
  label = 'Media: {:.2f}'.format(data_c1.mean())
)

# Agrega una línea vertical para la mediana
plt.axvline(
  data_c1.median(),
  color = '#90EE90',
  linestyle = 'dashed',
  linewidth = 2,
  label = 'Mediana: {:.2f}'.format(data_c1.median())
)

# Agrega la leyenda
plt.legend([
  'Media: {:.2f}s'.format(data_c1.mean()),
  'Mediana: {:.2f}s'.format(data_c1.median()),
  'Total de datos: {}'.format(len(data_c1)),
  'Casos de éxito: {}'.format(counts[1]),
  'Casos de fracaso: {}'.format(counts[0]),
  'Coeficiente de Identificación: {:.2f}'.format(coef)
])

# Guarda el gráfico en un archivo png
histogram_dir = os.path.join(script_dir, '../metrics/b.png')
plt.savefig(histogram_dir)
