import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Badge,
  Thumbnail,
  TextField,
  IndexTable,
  EmptyState,
  Banner,
  Tooltip,
  Divider,
} from "@shopify/polaris";
import { EditIcon, SaveIcon, XIcon, ImageIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import styles from "../styles/product-editor.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ProductRow = {
  id: string;
  title: string;
  status: string;
  imageUrl: string | null;
  variantId: string;
  price: string;
  currency: string;
};

// ---------------------------------------------------------------------------
// Loader: fetch products from the store's catalogue
// ---------------------------------------------------------------------------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query GetProducts {
        shop {
          currencyCode
        }
        products(first: 25, sortKey: TITLE) {
          edges {
            node {
              id
              title
              status
              featuredImage {
                url
                altText
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                  }
                }
              }
            }
          }
        }
      }`,
  );

  const { data } = await response.json();
  const currency = data?.shop?.currencyCode ?? "USD";

  const products: ProductRow[] = (data?.products?.edges ?? []).map(
    (edge: any) => {
      const node = edge.node;
      const variant = node.variants?.edges?.[0]?.node;
      return {
        id: node.id,
        title: node.title,
        status: node.status,
        imageUrl: node.featuredImage?.url ?? null,
        variantId: variant?.id ?? "",
        price: variant?.price ?? "0.00",
        currency,
      };
    },
  );

  return json({ products, currency });
};

// ---------------------------------------------------------------------------
// Action: update a product's title (name) and its first variant's price
// ---------------------------------------------------------------------------
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const productId = String(formData.get("productId"));
  const variantId = String(formData.get("variantId"));
  const title = String(formData.get("title") ?? "").trim();
  const price = String(formData.get("price") ?? "").trim();

  if (!productId || !title) {
    return json(
      { ok: false, error: "Product name cannot be empty." },
      { status: 400 },
    );
  }

  if (price && (isNaN(Number(price)) || Number(price) < 0)) {
    return json(
      { ok: false, error: "Price must be a valid positive number." },
      { status: 400 },
    );
  }

  // 1. Update the product title
  const titleResponse = await admin.graphql(
    `#graphql
      mutation UpdateProductTitle($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }`,
    { variables: { input: { id: productId, title } } },
  );
  const titleJson = await titleResponse.json();
  const titleErrors = titleJson.data?.productUpdate?.userErrors ?? [];

  // 2. Update the variant price (if a variant exists)
  let priceErrors: { field: string[]; message: string }[] = [];
  if (variantId && price) {
    const priceResponse = await admin.graphql(
      `#graphql
        mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          productId,
          variants: [{ id: variantId, price }],
        },
      },
    );
    const priceJson = await priceResponse.json();
    priceErrors = priceJson.data?.productVariantsBulkUpdate?.userErrors ?? [];
  }

  const allErrors = [...titleErrors, ...priceErrors];
  if (allErrors.length > 0) {
    return json(
      { ok: false, error: allErrors.map((e: any) => e.message).join(" ") },
      { status: 400 },
    );
  }

  return json({ ok: true, productId, title, price });
};

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
export default function ProductEditor() {
  const { products, currency } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPrice, setDraftPrice] = useState("");

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      shopify.toast.show("Product updated");
      setEditingId(null);
    } else if ("error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const resourceName = { singular: "product", plural: "products" };

  const startEdit = useCallback((row: ProductRow) => {
    setEditingId(row.id);
    setDraftTitle(row.title);
    setDraftPrice(row.price);
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback((row: ProductRow) => {
    fetcher.submit(
      {
        productId: row.id,
        variantId: row.variantId,
        title: draftTitle,
        price: draftPrice,
      },
      { method: "POST" },
    );
  }, [fetcher, draftPrice, draftTitle]);

  const currentlySavingId = isSaving
    ? String(fetcher.formData?.get("productId") ?? "")
    : "";

  const rowMarkup = useMemo(
    () =>
      (products as ProductRow[]).map((row, index) => {
        const isEditingRow = editingId === row.id;
        const isRowSaving = currentlySavingId === row.id;

        return (
          <IndexTable.Row
            id={row.id}
            key={row.id}
            position={index}
          >
            <IndexTable.Cell>
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                <Thumbnail
                  source={row.imageUrl || ImageIcon}
                  alt={row.title}
                  size="small"
                />
                {isEditingRow ? (
                  <div style={{ minWidth: "220px" }}>
                    <TextField
                      label="Product name"
                      labelHidden
                      autoComplete="off"
                      value={draftTitle}
                      onChange={setDraftTitle}
                      disabled={isRowSaving}
                    />
                  </div>
                ) : (
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {row.title}
                  </Text>
                )}
              </InlineStack>
            </IndexTable.Cell>

            <IndexTable.Cell>
              <Badge tone={row.status === "ACTIVE" ? "success" : "info"}>
                {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
              </Badge>
            </IndexTable.Cell>

            <IndexTable.Cell>
              {isEditingRow ? (
                <div style={{ maxWidth: "140px" }}>
                  <TextField
                    label="Price"
                    labelHidden
                    autoComplete="off"
                    type="number"
                    prefix={currency === "USD" ? "$" : currency}
                    value={draftPrice}
                    onChange={setDraftPrice}
                    disabled={isRowSaving}
                  />
                </div>
              ) : (
                <Text as="span" variant="bodyMd">
                  {new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency,
                  }).format(Number(row.price))}
                </Text>
              )}
            </IndexTable.Cell>

            <IndexTable.Cell>
              <InlineStack gap="200" align="end">
                {isEditingRow ? (
                  <>
                    <Button
                      icon={SaveIcon}
                      variant="primary"
                      size="slim"
                      loading={isRowSaving}
                      onClick={() => saveEdit(row)}
                    >
                      Save
                    </Button>
                    <Button
                      icon={XIcon}
                      size="slim"
                      disabled={isRowSaving}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Tooltip content="Edit name & price">
                    <Button
                      icon={EditIcon}
                      size="slim"
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </Button>
                  </Tooltip>
                )}
              </InlineStack>
            </IndexTable.Cell>
          </IndexTable.Row>
        );
      }),
    [
      products,
      editingId,
      draftTitle,
      draftPrice,
      currentlySavingId,
      currency,
      startEdit,
      cancelEdit,
      saveEdit,
    ],
  );

  const mobileProductMarkup = useMemo(
    () =>
      (products as ProductRow[]).map((row) => {
        const isEditingRow = editingId === row.id;
        const isRowSaving = currentlySavingId === row.id;

        return (
          <div className={styles.mobileProductCard} key={row.id}>
            <InlineStack align="space-between" blockAlign="start" wrap={false}>
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                <Thumbnail
                  source={row.imageUrl || ImageIcon}
                  alt={row.title}
                  size="small"
                />
                <BlockStack gap="100">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {row.title}
                  </Text>
                  <Badge tone={row.status === "ACTIVE" ? "success" : "info"}>
                    {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                  </Badge>
                </BlockStack>
              </InlineStack>
              {!isEditingRow && (
                <Button icon={EditIcon} onClick={() => startEdit(row)}>
                  Edit
                </Button>
              )}
            </InlineStack>

            {isEditingRow ? (
              <BlockStack gap="300">
                <TextField
                  label="Product name"
                  autoComplete="off"
                  value={draftTitle}
                  onChange={setDraftTitle}
                  disabled={isRowSaving}
                />
                <TextField
                  label="Price"
                  autoComplete="off"
                  type="number"
                  prefix={currency === "USD" ? "$" : currency}
                  value={draftPrice}
                  onChange={setDraftPrice}
                  disabled={isRowSaving}
                />
                <InlineStack gap="200" align="end">
                  <Button
                    icon={SaveIcon}
                    variant="primary"
                    loading={isRowSaving}
                    onClick={() => saveEdit(row)}
                  >
                    Save changes
                  </Button>
                  <Button
                    icon={XIcon}
                    disabled={isRowSaving}
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                </InlineStack>
              </BlockStack>
            ) : (
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">
                  Price
                </Text>
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  {new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency,
                  }).format(Number(row.price))}
                </Text>
              </InlineStack>
            )}
          </div>
        );
      }),
    [
      products,
      editingId,
      draftTitle,
      draftPrice,
      currentlySavingId,
      currency,
      startEdit,
      cancelEdit,
      saveEdit,
    ],
  );

  return (
    <Page fullWidth>
      <TitleBar title="Product Editor" />
      <BlockStack gap="500">
        {fetcher.data && !fetcher.data.ok && "error" in fetcher.data && (
          <Banner tone="critical" title="Couldn't save changes">
            <p>{fetcher.data.error}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">
                    Catalogue
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Edit a product's name or price below. Changes are saved
                    directly to your Shopify product catalogue.
                  </Text>
                </BlockStack>
              </Box>
              <Divider />
              {products.length === 0 ? (
                <EmptyState
                  heading="No products yet"
                  action={{
                    content: "Add a product in Shopify admin",
                    url: "shopify:admin/products/new",
                    target: "_blank",
                  }}
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Add a product to your store to start editing it here.</p>
                </EmptyState>
              ) : (
                <>
                  <div className={styles.desktopTable}>
                    <IndexTable
                      resourceName={resourceName}
                      itemCount={products.length}
                      headings={[
                        { title: "Product" },
                        { title: "Status" },
                        { title: "Price" },
                        { title: "Actions", alignment: "end" },
                      ]}
                      selectable={false}
                    >
                      {rowMarkup}
                    </IndexTable>
                  </div>
                  <div className={styles.mobileProductList}>
                    {mobileProductMarkup}
                  </div>
                </>
              )}
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    How it works
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    This app reads your store's products through the Admin
                    GraphQL API and writes edits back with the{" "}
                    <Text as="span" fontWeight="semibold">
                      productUpdate
                    </Text>{" "}
                    and{" "}
                    <Text as="span" fontWeight="semibold">
                      productVariantsBulkUpdate
                    </Text>{" "}
                    mutations, so every change is reflected instantly in your
                    Shopify Product Catalogue.
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    At a glance
                  </Text>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Products loaded
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {products.length}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Store currency
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {currency}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
