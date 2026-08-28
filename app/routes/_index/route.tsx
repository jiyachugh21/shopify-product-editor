import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Product Editor for Shopify</h1>
        <p className={styles.text}>
          An embedded Shopify admin app for updating product names and prices
          directly from one focused workspace.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Browse products.</strong> Loads up to 25 catalogue products
            with their status, image, and first-variant price.
          </li>
          <li>
            <strong>Edit inline.</strong> Change a product title and price without
            leaving the app.
          </li>
          <li>
            <strong>Save to Shopify.</strong> Changes are validated and sent to
            the Shopify Admin GraphQL API immediately.
          </li>
        </ul>
      </div>
    </div>
  );
}
