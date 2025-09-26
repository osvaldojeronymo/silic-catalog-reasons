import { screen } from '@testing-library/dom'
import user from '@testing-library/user-event'
import { expect, test } from 'vitest'

test('mostra título', async () => {
  document.body.innerHTML = `<h1 data-testid="titulo">Catálogo</h1>`
  expect(screen.getByTestId('titulo')).toHaveTextContent('Catálogo')
  await user.click(document.body)
})
