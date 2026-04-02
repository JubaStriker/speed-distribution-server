import mongoose from 'mongoose';
import Category from '../models/Category';
import Product from '../models/Product';
import { ServiceError } from './errors';

export async function getCategories() {
  return Category.find().sort({ name: 1 });
}

export async function createCategory(name: string) {
  const existing = await Category.findOne({ name });
  if (existing) throw new ServiceError(409, 'Category with this name already exists');

  return Category.create({ name });
}

export async function deleteCategory(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, 'Invalid category ID');
  }

  const category = await Category.findById(id);
  if (!category) throw new ServiceError(404, 'Category not found');

  const productCount = await Product.countDocuments({ category_id: new mongoose.Types.ObjectId(id) });
  if (productCount > 0) {
    throw new ServiceError(409, 'Cannot delete category with associated products');
  }

  await Category.findByIdAndDelete(id);
}
