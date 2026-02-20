# Power BI — Medidas DAX (dados sintéticos)

## 1) Nomes de tabelas sugeridos

Ao importar os CSVs, renomeie para:

- `FatoDevolucoes` (de `fato_devolucoes.synthetic.csv`)
- `DimMotivos` (de `dim_motivos.synthetic.csv`)
- `DimUnidades` (de `dim_unidades.synthetic.csv`)

Relacionamentos:

- `FatoDevolucoes[motivoId]` -> `DimMotivos[motivoId]`
- `FatoDevolucoes[unidadeId]` -> `DimUnidades[unidadeId]`

## 2) Medidas base

```DAX
Total Devolucoes = COUNTROWS(FatoDevolucoes)
```

```DAX
SLA Estourado = SUM(FatoDevolucoes[slaEstourado])
```

```DAX
SLA Dentro = [Total Devolucoes] - [SLA Estourado]
```

```DAX
% SLA Dentro = DIVIDE([SLA Dentro], [Total Devolucoes], 0)
```

```DAX
Tempo Medio Correcao (dias) = AVERAGE(FatoDevolucoes[tempoCorrecaoDias])
```

```DAX
Tempo Mediano Correcao (dias) = MEDIAN(FatoDevolucoes[tempoCorrecaoDias])
```

## 3) Tendência e comparação

> Requer uma tabela calendário relacionada a `FatoDevolucoes[dataAbertura]`.

```DAX
Total Devolucoes M-1 =
CALCULATE(
    [Total Devolucoes],
    DATEADD('Calendario'[Data], -1, MONTH)
)
```

```DAX
Var % vs Mes Anterior =
DIVIDE(
    [Total Devolucoes] - [Total Devolucoes M-1],
    [Total Devolucoes M-1],
    0
)
```

```DAX
SLA Dentro M-1 =
CALCULATE(
    [% SLA Dentro],
    DATEADD('Calendario'[Data], -1, MONTH)
)
```

```DAX
Var SLA p.p. = ([% SLA Dentro] - [SLA Dentro M-1]) * 100
```

## 4) Pareto de motivos

Use em visual com eixo `DimMotivos[descricao]` ordenado por `[Total Devolucoes]` desc.

```DAX
Rank Motivo =
RANKX(
    ALLSELECTED(DimMotivos[descricao]),
    [Total Devolucoes],
    ,
    DESC,
    DENSE
)
```

```DAX
Total Acumulado Pareto =
VAR r = [Rank Motivo]
RETURN
SUMX(
    TOPN(r, ALLSELECTED(DimMotivos[descricao]), [Total Devolucoes], DESC),
    [Total Devolucoes]
)
```

```DAX
% Acumulado Pareto =
DIVIDE([Total Acumulado Pareto], CALCULATE([Total Devolucoes], ALLSELECTED(DimMotivos[descricao])), 0)
```

```DAX
Faixa Pareto =
IF([% Acumulado Pareto] <= 0.8, "A (80%)", "B/C")
```

## 5) Indicadores de gestão

```DAX
Taxa Estouro SLA = DIVIDE([SLA Estourado], [Total Devolucoes], 0)
```

```DAX
Devolucoes Criticidade Alta =
CALCULATE(
    [Total Devolucoes],
    FatoDevolucoes[criticidade] = "Alta"
)
```

```DAX
% Criticidade Alta = DIVIDE([Devolucoes Criticidade Alta], [Total Devolucoes], 0)
```

```DAX
Top 5 Motivos Devolucoes =
VAR Top5 =
    TOPN(
        5,
        SUMMARIZE(
            DimMotivos,
            DimMotivos[descricao],
            "Qtd", [Total Devolucoes]
        ),
        [Qtd], DESC
    )
RETURN
SUMX(Top5, [Qtd])
```

```DAX
% Top 5 Motivos = DIVIDE([Top 5 Motivos Devolucoes], [Total Devolucoes], 0)
```

## 6) Visuais recomendados

- Cartões: `[Total Devolucoes]`, `[% SLA Dentro]`, `[Tempo Medio Correcao (dias)]`, `[% Top 5 Motivos]`
- Linha: devoluções por mês (`Calendario[MesAno]` x `[Total Devolucoes]`)
- Barras: `DimMotivos[descricao]` x `[Total Devolucoes]` (Top 10)
- Pareto: barras `[Total Devolucoes]` + linha `[% Acumulado Pareto]`
- Mapa/coluna: `DimUnidades[regiao]` ou `DimUnidades[unidade]` x `[Total Devolucoes]`
- Heatmap: `DimMotivos[situacao]` x `DimMotivos[categoria]` com `[Total Devolucoes]`

## 7) Meta sugerida

- `% SLA Dentro` >= 85%
- `Tempo Medio Correcao (dias)` <= 4
- `% Top 5 Motivos` <= 60%
