import AdminProductForm from '../AdminProductForm'

export const metadata = { title: 'Add New Product' }

export default function NewProductPage() {
  return <AdminProductForm mode="create" />
}
