import { render } from '@testing-library/react';
import App from './App';

test('renders camera app without crashing', () => {
  const { container } = render(<App />);
  expect(container).toBeInTheDocument();
});
